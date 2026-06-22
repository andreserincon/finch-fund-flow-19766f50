import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUserRoles, type AppRole, type UserWithRole } from '@/hooks/useUserRoles';
import { CreateUserDialog } from '@/components/users/CreateUserDialog';
import { EditUserDialog } from '@/components/users/EditUserDialog';
import { ResetPasswordDialog } from '@/components/users/ResetPasswordDialog';
import { ROLE_OPTIONS, getRoleLabel } from '@/lib/roles';
import { Users, UserPlus, Pencil, KeyRound, MoreHorizontal } from 'lucide-react';

// Role chips are NOT payment statuses. The treasurer chip uses a dedicated
// neutral token (role-chip) so it is no longer coupled to the .status-ahead
// color, which was remapped to blue for the "Adelantado" status.
const ROLE_CHIP: Record<string, string> = {
  admin: 'status-up-to-date',
  treasurer: 'role-chip',
  vm: 'bg-secondary text-secondary-foreground',
  bibliotecario: 'status-unpaid',
  member: 'bg-muted text-muted-foreground',
};

const GRADE_LABEL: Record<string, string> = { aprendiz: 'Aprendiz', companero: 'Compañero', maestro: 'Maestro' };
const GRADE_CHIP: Record<string, string> = {
  aprendiz: 'border-border text-muted-foreground',
  companero: 'border-primary/40 text-primary',
  maestro: 'border-primary text-primary font-semibold',
};

function RoleChip({ role }: { role: string | null }) {
  if (!role) return <span className="status-badge bg-muted text-muted-foreground">Sin rol</span>;
  return <span className={`status-badge ${ROLE_CHIP[role] ?? 'bg-muted text-muted-foreground'}`}>{getRoleLabel(role as AppRole)}</span>;
}

function GradeChip({ grade }: { grade: string | null }) {
  if (!grade) return <span className="text-muted-foreground text-sm">Sin grado</span>;
  return (
    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${GRADE_CHIP[grade] ?? 'border-border text-muted-foreground'}`}>
      {GRADE_LABEL[grade] ?? grade}
    </span>
  );
}

function UserActions({ user, onEdit, onReset }: { user: UserWithRole; onEdit: () => void; onReset: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-10 w-10 press" aria-label="Acciones del usuario">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-popover">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="mr-2 h-4 w-4" /> Editar rol y miembro
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onReset}>
          <KeyRound className="mr-2 h-4 w-4" /> Restablecer acceso
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function UserManagement() {
  const { t } = useTranslation();
  const { users, isLoading } = useUserRoles();
  const membersWithAccount = (users ?? [])
    .map((u) => u.member_id)
    .filter((id): id is string => !!id);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithRole | null>(null);
  const [resetPasswordEmail, setResetPasswordEmail] = useState<string | null>(null);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Accesos y Roles
          </h1>
          <div className="rule-gold mt-2" />
          <p className="text-muted-foreground mt-2">Gestión de usuarios con acceso a la aplicación</p>
        </div>
        <Button className="press shrink-0" onClick={() => setIsCreateDialogOpen(true)}>
          <UserPlus className="h-4 w-4 mr-2" />
          Otorgar acceso
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ROLE_OPTIONS.map((o) => (
          <div key={o.value} className="stat-card">
            <div className="flex items-center justify-between">
              <p className="font-medium">{o.label}</p>
              <RoleChip role={o.value} />
            </div>
            <p className="text-xs text-muted-foreground mt-2">{o.description}</p>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="section-header">Usuarios</CardTitle>
          <CardDescription>Cada acceso esta vinculado a un hermano de la logia</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3" aria-label="Cargando usuarios">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : !users || users.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Todavia no hay usuarios. Usa "Otorgar acceso" para crear el primero.
            </div>
          ) : (
            <>
              {/* Mobile card view */}
              <div className="md:hidden space-y-3">
                {users.map((user) => (
                  <div key={user.user_id} className="rounded-lg border bg-card p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-sm break-all">{user.email}</p>
                        <p className="text-sm text-muted-foreground mt-0.5">{user.member_name || 'Sin miembro asociado'}</p>
                      </div>
                      <UserActions
                        user={user}
                        onEdit={() => setEditingUser(user)}
                        onReset={() => setResetPasswordEmail(user.email)}
                      />
                    </div>
                    <div className="flex items-center gap-2 border-t border-border/50 pt-3">
                      <RoleChip role={user.role} />
                      <GradeChip grade={user.masonic_grade} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table view */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Correo</TableHead>
                      <TableHead>Miembro</TableHead>
                      <TableHead>Grado</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead className="text-right">{t('common.actions', 'Acciones')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.user_id}>
                        <TableCell className="font-mono text-sm">{user.email}</TableCell>
                        <TableCell>{user.member_name || <span className="text-muted-foreground text-sm">Sin miembro</span>}</TableCell>
                        <TableCell><GradeChip grade={user.masonic_grade} /></TableCell>
                        <TableCell><RoleChip role={user.role} /></TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end">
                            <UserActions
                              user={user}
                              onEdit={() => setEditingUser(user)}
                              onReset={() => setResetPasswordEmail(user.email)}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <CreateUserDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        excludeMemberIds={membersWithAccount}
      />
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
