import { useState } from "react";
import type { MemberDetailResponse, PermissionOverride } from "@sandbox/api-contract";
import { Badge } from "../../components/ui/badge.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../components/ui/card.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table.tsx";

type Effect = "inherit" | PermissionOverride["effect"];

/**
 * 権限の上書き。役割の既定に対して個別に許可 / 拒否を重ねる。拒否が優先。
 */
export function PermissionEditor({
  detail,
  editable,
  available,
  pending,
  onClose,
  onSave,
}: {
  detail: MemberDetailResponse;
  editable: boolean;
  available: ReadonlyArray<string>;
  pending: boolean;
  onClose: () => void;
  onSave: (overrides: PermissionOverride[]) => Promise<void>;
}) {
  const initial = new Map(detail.overrides.map((o) => [o.permission, o.effect]));
  const [effects, setEffects] = useState<Map<string, Effect>>(
    new Map(available.map((p) => [p, initial.get(p) ?? "inherit"])),
  );
  const granted = new Set(detail.permissions);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {detail.member.email ?? detail.member.user_id} の権限{" "}
          <span className="font-normal text-muted-foreground">役割 {detail.member.role}</span>
        </CardTitle>
        <CardDescription>
          役割の既定に対して個別に許可か拒否を重ねる。拒否が優先する。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>権限</TableHead>
              <TableHead>現在</TableHead>
              <TableHead>上書き</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {available.map((permission) => (
              <TableRow key={permission}>
                <TableCell className="font-mono text-xs">{permission}</TableCell>
                <TableCell>
                  {granted.has(permission) ? (
                    <Badge>yes</Badge>
                  ) : (
                    <Badge variant="outline">no</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Select
                    value={effects.get(permission) ?? "inherit"}
                    disabled={!editable}
                    onValueChange={(value) =>
                      setEffects(new Map(effects).set(permission, value as Effect))
                    }
                  >
                    <SelectTrigger size="sm" aria-label={`${permission} の上書き`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inherit">役割どおり</SelectItem>
                      <SelectItem value="allow">許可</SelectItem>
                      <SelectItem value="deny">拒否</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <CardFooter className="gap-2">
        {editable && (
          <Button
            disabled={pending}
            onClick={() =>
              void onSave(
                [...effects.entries()]
                  .filter(
                    (entry): entry is [string, PermissionOverride["effect"]] =>
                      entry[1] !== "inherit",
                  )
                  .map(([permission, effect]) => ({ permission, effect })),
              )
            }
          >
            保存
          </Button>
        )}
        <Button variant="outline" onClick={onClose}>
          閉じる
        </Button>
      </CardFooter>
    </Card>
  );
}
