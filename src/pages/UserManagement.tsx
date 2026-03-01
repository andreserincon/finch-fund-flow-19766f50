import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserRoles, AppRole } from '@/hooks/useUserRoles';
import { CreateUserDialog } from '@/components/users/CreateUserDialog';
import { EditUserDialog } from '@/components/users/EditUserDialog';
import { Users, Shield, Eye, User, X, UserPlus, BookOpen, Crown, Pencil } from 'lucide-react';

export default function UserManagement() {
  const { t } = useTranslation();
  const { users, isLoading, assignRole, removeRole } = useUserRoles();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);

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

  const getPermissionDescription = (role: AppRole | null) => {
    if (!role) return t('userManagement.permissions.none');
    return t(`userManagement.permissions.${role}`);
  };

  const handleRoleChange = (userId: string, newRole: string) => {
    if (newRole === 'none') {
      removeRole.mutate(userId);
    } else {
      assignRole.mutate({ userId, role: newRole as AppRole });
    }
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
                  <TableHead>{t('userManagement.currentRole')}</TableHead>
                  <TableHead>{t('userManagement.permissions.title')}</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users?.map((user) => (
                  <TableRow key={user.user_id}>
                    <TableCell className="font-medium">{user.email}</TableCell>
                    <TableCell>{getRoleBadge(user.role)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {getPermissionDescription(user.role)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Select
                          value={user.role || 'none'}
                          onValueChange={(value) => handleRoleChange(user.user_id, value)}
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">{t('userManagement.noRole')}</SelectItem>
                            <SelectItem value="treasurer">{t('userManagement.roles.treasurer')}</SelectItem>
                            <SelectItem value="vm">{t('userManagement.roles.vm')}</SelectItem>
                            <SelectItem value="member">{t('userManagement.roles.member')}</SelectItem>
                            <SelectItem value="bibliotecario">{t('userManagement.roles.bibliotecario')}</SelectItem>
                            <SelectItem value="admin">{t('userManagement.roles.admin')}</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingUser(user.email)}
                          title={t('userManagement.editUser', 'Editar Usuario')}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {user.role && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeRole.mutate(user.user_id)}
                            disabled={removeRole.isPending}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {(!users || users.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
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
      <EditUserDialog
        open={!!editingUser}
        onOpenChange={(open) => !open && setEditingUser(null)}
        userEmail={editingUser || ''}
      />
    </div>
  );
}
