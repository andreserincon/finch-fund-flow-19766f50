-- Create enum for fee types
CREATE TYPE public.fee_type AS ENUM ('standard', 'solidarity');

-- Create enum for transaction types
CREATE TYPE public.transaction_type AS ENUM ('income', 'expense');

-- Create enum for transaction categories
CREATE TYPE public.transaction_category AS ENUM (
  'monthly_fee',
  'extraordinary_income',
  'donation',
  'reimbursement',
  'event_expense',
  'parent_organization_fee',
  'other_expense',
  'other_income'
);

-- Create members table
CREATE TABLE public.members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone_number TEXT NOT NULL UNIQUE,
  monthly_fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  fee_type fee_type NOT NULL DEFAULT 'standard',
  is_active BOOLEAN NOT NULL DEFAULT true,
  join_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create transactions table
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount DECIMAL(10,2) NOT NULL,
  transaction_type transaction_type NOT NULL,
  category transaction_category NOT NULL,
  member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create organization_settings table for storing account balances and configs
CREATE TABLE public.organization_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL UNIQUE,
  setting_value DECIMAL(10,2) NOT NULL DEFAULT 0,
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert default organization settings
INSERT INTO public.organization_settings (setting_key, setting_value, description) VALUES
  ('monthly_parent_obligation', 0, 'Monthly fee owed to parent organization'),
  ('initial_bank_balance', 0, 'Starting bank balance for calculations'),
  ('initial_parent_balance', 0, 'Starting balance with parent organization');

-- Create profiles table for authentication
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('treasurer', 'member')),
  member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_members_updated_at
  BEFORE UPDATE ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_organization_settings_updated_at
  BEFORE UPDATE ON public.organization_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS on all tables
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check if user is treasurer
CREATE OR REPLACE FUNCTION public.is_treasurer(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND role = 'treasurer'
  )
$$;

-- Create security definer function to get member_id for user
CREATE OR REPLACE FUNCTION public.get_user_member_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT member_id FROM public.profiles WHERE id = _user_id
$$;

-- RLS Policies for members
CREATE POLICY "Treasurers can view all members"
  ON public.members FOR SELECT
  TO authenticated
  USING (public.is_treasurer(auth.uid()));

CREATE POLICY "Members can view own record"
  ON public.members FOR SELECT
  TO authenticated
  USING (id = public.get_user_member_id(auth.uid()));

CREATE POLICY "Treasurers can insert members"
  ON public.members FOR INSERT
  TO authenticated
  WITH CHECK (public.is_treasurer(auth.uid()));

CREATE POLICY "Treasurers can update members"
  ON public.members FOR UPDATE
  TO authenticated
  USING (public.is_treasurer(auth.uid()));

CREATE POLICY "Treasurers can delete members"
  ON public.members FOR DELETE
  TO authenticated
  USING (public.is_treasurer(auth.uid()));

-- RLS Policies for transactions
CREATE POLICY "Treasurers can view all transactions"
  ON public.transactions FOR SELECT
  TO authenticated
  USING (public.is_treasurer(auth.uid()));

CREATE POLICY "Members can view own transactions"
  ON public.transactions FOR SELECT
  TO authenticated
  USING (member_id = public.get_user_member_id(auth.uid()));

CREATE POLICY "Treasurers can insert transactions"
  ON public.transactions FOR INSERT
  TO authenticated
  WITH CHECK (public.is_treasurer(auth.uid()));

CREATE POLICY "Treasurers can update transactions"
  ON public.transactions FOR UPDATE
  TO authenticated
  USING (public.is_treasurer(auth.uid()));

CREATE POLICY "Treasurers can delete transactions"
  ON public.transactions FOR DELETE
  TO authenticated
  USING (public.is_treasurer(auth.uid()));

-- RLS Policies for organization_settings
CREATE POLICY "Treasurers can view settings"
  ON public.organization_settings FOR SELECT
  TO authenticated
  USING (public.is_treasurer(auth.uid()));

CREATE POLICY "Treasurers can update settings"
  ON public.organization_settings FOR UPDATE
  TO authenticated
  USING (public.is_treasurer(auth.uid()));

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (NEW.id, 'member');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create view for member balances (computed from transactions)
CREATE OR REPLACE VIEW public.member_balances AS
SELECT 
  m.id as member_id,
  m.full_name,
  m.phone_number,
  m.monthly_fee_amount,
  m.fee_type,
  m.is_active,
  m.join_date,
  COALESCE(SUM(
    CASE 
      WHEN t.transaction_type = 'income' THEN t.amount
      WHEN t.transaction_type = 'expense' THEN -t.amount
      ELSE 0
    END
  ), 0) as current_balance,
  -- Calculate months since join
  EXTRACT(YEAR FROM age(CURRENT_DATE, m.join_date)) * 12 + 
  EXTRACT(MONTH FROM age(CURRENT_DATE, m.join_date)) + 1 as months_since_join,
  -- Calculate total fees owed
  (EXTRACT(YEAR FROM age(CURRENT_DATE, m.join_date)) * 12 + 
   EXTRACT(MONTH FROM age(CURRENT_DATE, m.join_date)) + 1) * m.monthly_fee_amount as total_fees_owed
FROM public.members m
LEFT JOIN public.transactions t ON t.member_id = m.id
GROUP BY m.id;