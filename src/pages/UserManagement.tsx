import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserRoles, AppRole, type UserWithRole } from '@/hooks/useUserRoles';
import { CreateUserDialog } from '@/components/users/CreateUserDialog';
import { EditUserDialog } from '@/components/users/EditUserDialog';
import { ResetPasswordDialog } from '@/components/users/ResetPasswordDialog';
import { Users, Shield, Eye, User, UserPlus, BookOpen, Crown, Pencil, KeyRound } from 'lucide-react';

export default function UserManagement() {
  const { t } = useTranslation();
  const { users, isLoading } = useUserRoles();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithRole | null>(null);
  const [resetPasswordEmail, setResetPasswordEmail] = useState<string | null>(null);

  const getRoleBadge = (role: AppRole | null) => {
    if (!role) return <Badge variant="outline">{t('userManagement.noRole')}</Badge>;
    const config: Record<string, { className: string; icon: any; label: string }> = {
      treasurer: { className: 'bg-primary', icon: Shield, label: t('userManagement.roles.treasurer') },
      vm: { className: '', icon: Eye, label: t('userManagement.roles.vm') },
      member: { className: '', icon: User, label: t('userManagement.roles.member') },
      bibliotecario: { className: 'bg-amber-600', icon: BookOpen, label: t('userManagement.roles.bibliotecario') },
      admin: { className: 'bg-emerald-600', icon: Crown, label: t('userManagement.roles.admin') },
    };
    const c = config[role];
    if (!c) return <Badge variant="outline">{role}</Badge>;
    const Icon = c.icon;
    return (
      <Badge variant={role === 'vm' ? 'secondary' : role === 'member' ? 'outline' : 'default'} className={c.className}>
        <Icon className="h-3 w-3 mr-1" />{c.label}
      </Badge>
    );
  };

  const getGradeBadge = (grade: string | null) => {
    if (!grade) return <span className="text-muted-foreground text-sm">—</span>;
    const gradeConfig: Record<string, { label: string; className: string }> = {
      aprendiz: { label: t('userManagement.grades.aprendiz', 'Aprendiz'), className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
      companero: { label: t('userManagement.grades.companero', 'Compañero'), className: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' },
      maestro: { label: t('userManagement.grades.maestro', 'Maestro'), className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
    };
    const c = gradeConfig[grade];
    if (!c) return <Badge variant="outline">{grade}</Badge>;
    return <Badge variant="outline" className={c.className}>{c.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-8 w-8" />
            {t('userManagement.title')}
          </h1>
          <p className="text-muted-foreground mt-1">{t('userManagement.subtitle')}</p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <UserPlus className="h-4 w-4 mr-2" />
          {t('userManagement.createUser', 'Crear Usuario')}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {(['treasurer', 'vm', 'member', 'bibliotecario'] as const).map((role) => {
          const icons: Record<string, any> = { treasurer: Shield, vm: Eye, member: User, bibliotecario: BookOpen };
          const colors: Record<string, string> = { treasurer: 'text-primary', vm: 'text-secondary-foreground', member: 'text-muted-foreground', bibliotecario: 'text-amber-600' };
          const Icon = icons[role];
          return (
            <Card key={role}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t(`userManagement.roles.${role}`)}</CardTitle>
                <Icon className={`h-4 w-4 ${colors[role]}`} />
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">{t(`userManagement.permissions.${role}`)}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('userManagement.usersTable')}</CardTitle>
          <CardDescription>{t('userManagement.usersTableDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center space-x-4">
                  <Skeleton className="h-12 w-full" />
                </div>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('userManagement.email')}</TableHead>
                  <TableHead>{t('userManagement.associatedMember', 'Miembro')}</TableHead>
                  <TableHead>{t('userManagement.grade', 'Grado')}</TableHead>
                  <TableHead>{t('userManagement.currentRole')}</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users?.map((user) => (
                  <TableRow key={user.user_id}>
                    <TableCell className="font-medium">{user.email}</TableCell>
                    <TableCell>{user.member_name || <span className="text-muted-foreground text-sm">—</span>}</TableCell>
                    <TableCell>{getGradeBadge(user.masonic_grade)}</TableCell>
                    <TableCell>{getRoleBadge(user.role)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingUser(user)}
                          title={t('userManagement.editUser', 'Editar Usuario')}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setResetPasswordEmail(user.email)}
                          title={t('userManagement.resetPassword', 'Cambiar Contraseña')}
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {(!users || users.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      {t('userManagement.noUsers')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreateUserDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} />
      {editingUser && (
        <EditUserDialog
          open={!!editingUser}
          onOpenChange={(open) => !open && setEditingUser(null)}
          userId={editingUser.user_id}
          userEmail={editingUser.email}
          currentRole={editingUser.role}
          currentMemberId={editingUser.member_id}
          currentGrade={editingUser.masonic_grade}
        />
      )}
      <ResetPasswordDialog
        open={!!resetPasswordEmail}
        onOpenChange={(open) => !open && setResetPasswordEmail(null)}
        userEmail={resetPasswordEmail || ''}
      />
    </div>
  );
}
