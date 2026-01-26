import { useTranslation } from 'react-i18next';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserRoles, AppRole } from '@/hooks/useUserRoles';
import { Users, Shield, Eye, User, X } from 'lucide-react';

export default function UserManagement() {
  const { t } = useTranslation();
  const { users, isLoading, assignRole, removeRole } = useUserRoles();

  const getRoleBadge = (role: AppRole | null) => {
    if (!role) {
      return <Badge variant="outline">{t('userManagement.noRole')}</Badge>;
    }

    switch (role) {
      case 'treasurer':
        return (
          <Badge className="bg-primary">
            <Shield className="h-3 w-3 mr-1" />
            {t('userManagement.roles.treasurer')}
          </Badge>
        );
      case 'vm':
        return (
          <Badge variant="secondary">
            <Eye className="h-3 w-3 mr-1" />
            {t('userManagement.roles.vm')}
          </Badge>
        );
      case 'member':
        return (
          <Badge variant="outline">
            <User className="h-3 w-3 mr-1" />
            {t('userManagement.roles.member')}
          </Badge>
        );
      default:
        return <Badge variant="outline">{role}</Badge>;
    }
  };

  const getPermissionDescription = (role: AppRole | null) => {
    switch (role) {
      case 'treasurer':
        return t('userManagement.permissions.treasurer');
      case 'vm':
        return t('userManagement.permissions.vm');
      case 'member':
        return t('userManagement.permissions.member');
      default:
        return t('userManagement.permissions.none');
    }
  };

  const handleRoleChange = (userId: string, newRole: string) => {
    if (newRole === 'none') {
      removeRole.mutate(userId);
    } else {
      assignRole.mutate({ userId, role: newRole as AppRole });
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Users className="h-8 w-8" />
              {t('userManagement.title')}
            </h1>
            <p className="text-muted-foreground mt-1">
              {t('userManagement.subtitle')}
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('userManagement.roles.treasurer')}
              </CardTitle>
              <Shield className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                {t('userManagement.permissions.treasurer')}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('userManagement.roles.vm')}
              </CardTitle>
              <Eye className="h-4 w-4 text-secondary-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                {t('userManagement.permissions.vm')}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('userManagement.roles.member')}
              </CardTitle>
              <User className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                {t('userManagement.permissions.member')}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('userManagement.usersTable')}</CardTitle>
            <CardDescription>
              {t('userManagement.usersTableDescription')}
            </CardDescription>
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
                            </SelectContent>
                          </Select>
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
      </div>
    </MainLayout>
  );
}
