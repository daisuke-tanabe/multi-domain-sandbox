import { cn } from "@sandbox/web-ui";
import type { EndUser } from "@sandbox/api-contract";
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@sandbox/web-ui";

export function EndUserTable({
  endUsers,
  canUpdate,
  canDelete,
  pending,
  onEdit,
  onDelete,
}: {
  endUsers: ReadonlyArray<EndUser>;
  canUpdate: boolean;
  canDelete: boolean;
  pending: boolean;
  onEdit: (user: EndUser) => void;
  onDelete: (user: EndUser) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>名前</TableHead>
          <TableHead>メール</TableHead>
          <TableHead>電話</TableHead>
          <TableHead>メモ</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {endUsers.map((user) => (
          <TableRow key={user.id}>
            <TableCell className="font-medium">{user.name}</TableCell>
            <TableCell className={cn(user.masked && "text-muted-foreground")}>
              {user.email}
            </TableCell>
            <TableCell className={cn(user.masked && "text-muted-foreground")}>
              {user.phone}
            </TableCell>
            <TableCell>{user.note}</TableCell>
            <TableCell className="space-x-2 text-right">
              {canUpdate && (
                <Button variant="outline" size="sm" onClick={() => onEdit(user)}>
                  編集
                </Button>
              )}
              {canDelete && (
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={pending}
                  onClick={() => onDelete(user)}
                >
                  削除
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
