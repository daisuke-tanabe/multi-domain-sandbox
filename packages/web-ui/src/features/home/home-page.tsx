import { Link } from "react-router";
import { Badge } from "../../components/ui/badge.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table.tsx";
import { PageHeader } from "../../components/page-header.tsx";
import { useShell } from "../../lib/shell.ts";

/**
 * ホーム。役割と、このサービスの権限ごとの付与状態。
 */
export function HomePage({ primary }: { primary: { to: string; label: string } }) {
  const { me, session } = useShell();
  const granted = new Set(me.permissions);
  return (
    <>
      <PageHeader
        title="ホーム"
        description={`${session.tenant.slug} の ${session.service.name} に ${me.role} としてログインしています。`}
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>権限</TableHead>
            <TableHead>付与</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {me.service.permissions.map((permission) => (
            <TableRow key={permission}>
              <TableCell className="font-mono text-xs">{permission}</TableCell>
              <TableCell>
                {granted.has(permission) ? <Badge>yes</Badge> : <Badge variant="outline">no</Badge>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Button asChild variant="outline">
        <Link to={primary.to}>{primary.label}</Link>
      </Button>
    </>
  );
}
