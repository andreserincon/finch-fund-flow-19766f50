import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, Send, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import { supabase } from '@/integrations/supabase/client';

interface InsightsAgentProps {
  context: {
    bankBalance: number;
    greatLodgeBalance: number;
    savingsBalance: number;
    totalARSBalance: number;
    monthlyIncome: number;
    monthlyExpenses: number;
    activeMembersCount: number;
    membersUnpaid: number;
    membersOverdue: number;
    totalLoansDueARS: number;
    totalLoansDueUSD: number;
    recentTransactions: Array<{
      category: string;
      amount: number;
      transaction_type: string;
      transaction_date: string;
    }>;
  };
}

export function InsightsAgent({ context }: InsightsAgentProps) {
  const { t, i18n } = useTranslation();
  const [question, setQuestion] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestedQuestions = [
    t('insights.financialHealth'),
    t('insights.membersNeedAttention'),
    t('insights.monthlyCashFlow'),
    t('insights.summarizeMetrics'),
  ];

  const askQuestion = async (q: string) => {
    if (!q.trim()) return;
    
    setIsLoading(true);
    setResponse('');
    setError(null);
    setIsExpanded(true);

    try {
      // Get the current user's session token for authentication
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/treasury-insights`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ 
          question: q, 
          context,
          language: i18n.language === 'es' ? 'Spanish' : 'English'
        }),
      });

      if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.error || 'Failed to get insights');
      }

      if (!resp.body) throw new Error('No response body');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let fullResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              fullResponse += content;
              setResponse(fullResponse);
            }
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      setQuestion('');
    } catch (err) {
      console.error('Insights error:', err);
      setError(err instanceof Error ? err.message : 'Failed to get insights');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    askQuestion(question);
  };

  return (
    <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">{t('insights.title')}</CardTitle>
          </div>
          {(response || error) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-8 w-8 p-0"
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          )}
        </div>
        <CardDescription>
          {t('insights.placeholder')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick suggestion chips */}
        <div className="flex flex-wrap gap-2">
          {suggestedQuestions.map((q) => (
            <Button
              key={q}
              variant="outline"
              size="sm"
              onClick={() => askQuestion(q)}
              disabled={isLoading}
              className="text-xs h-7"
            >
              {q}
            </Button>
          ))}
        </div>

        {/* Input form */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            placeholder={t('insights.placeholder')}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" disabled={isLoading || !question.trim()} size="icon">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>

        {/* Response area */}
        {(response || error || isLoading) && isExpanded && (
          <div
            className={cn(
              'rounded-lg p-4 text-sm',
              error ? 'bg-destructive/10 text-destructive' : 'bg-muted/50'
            )}
          >
            {error ? (
              <p>{error}</p>
            ) : response ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{response}</ReactMarkdown>
              </div>
            ) : isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t('common.loading')}</span>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
