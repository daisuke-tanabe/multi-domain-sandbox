import { useState } from "react";
import type { Member, MemberDetailResponse } from "@sandbox/api-contract";
import { Notice } from "../../components/notice.tsx";
import { PageHeader } from "../../components/page-header.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import { Button } from "../../components/ui/button.tsx";
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
import { describeError } from "../../lib/api.ts";
import { useShell } from "../../lib/shell.ts";
import { useAction } from "../../lib/use-action.ts";
import { InviteMemberForm } from "./invite-member-form.tsx";
import {
  changeMemberRole,
  inviteMember,
  loadMemberDetail,
  removeMember,
  replaceMemberOverrides,
} from "./members.api.ts";
import { PermissionEditor } from "./permission-editor.tsx";

/**
 * 管理アカウントの一覧、招待、役割変更、権限の上書き、削除。
 * 役割と権限の語彙は /v1/me の service から受け取るので、CRM と CMS で同じ画面を使える。
 */
export function MembersPage({ members }: { members: ReadonlyArray<Member> }) {
  const { me } = useShell();
  const permissions = new Set(me.permissions);
  const action = useAction();
  const [selected, setSelected] = useState<MemberDetailResponse | undefined>();
  const [detailError, setDetailError] = useState<string | undefined>();
  const canManage = permissions.has("members:manage");

  const open = async (userId: string) => {
    setDetailError(undefined);
    try {
      setSelected(await loadMemberDetail(userId));
    } catch (cause: unknown) {
      setDetailError(describeError(cause));
    }
  };

  return (
    <>
      <PageHeader
        title="管理アカウント"
        description="入れるかどうかは Auth Server が持ち、役割と権限はこのサービスが持つ。"
      />
      {action.error !== undefined && <Notice kind="error">{action.error}</Notice>}
      {detailError !== undefined && <Notice kind="error">{detailError}</Notice>}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>メール</TableHead>
            <TableHead>名前</TableHead>
            <TableHead>役割</TableHead>
            <TableHead>状態</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.user_id}>
              <TableCell>
                {member.email ?? <span className="text-muted-foreground">{member.user_id}</span>}
              </TableCell>
              <TableCell>{member.name ?? ""}</TableCell>
              <TableCell>
                {canManage ? (
                  <Select
                    value={member.role}
                    onValueChange={(role) =>
                      void action.run(() => changeMemberRole(member.user_id, role))
                    }
                  >
                    <SelectTrigger
                      size="sm"
                      aria-label={`${member.email ?? member.user_id} の役割`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {me.service.roles.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  member.role
                )}
              </TableCell>
              <TableCell>
                <Badge variant={member.status === "active" ? "secondary" : "outline"}>
                  {member.status}
                </Badge>
              </TableCell>
              <TableCell className="space-x-2 text-right">
                <Button variant="outline" size="sm" onClick={() => void open(member.user_id)}>
                  権限
                </Button>
                {canManage && member.user_id !== me.user.id && (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={action.pending}
                    onClick={() => void action.run(() => removeMember(member.user_id))}
                  >
                    削除
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {permissions.has("members:invite") && (
        <InviteMemberForm
          roles={me.service.roles}
          pending={action.pending}
          onSubmit={(input) => action.run(() => inviteMember(input))}
        />
      )}

      {selected !== undefined && (
        <PermissionEditor
          detail={selected}
          editable={canManage}
          available={me.service.permissions}
          pending={action.pending}
          onClose={() => setSelected(undefined)}
          onSave={async (overrides) => {
            const ok = await action.run(() =>
              replaceMemberOverrides(selected.member.user_id, overrides),
            );
            if (ok) setSelected(undefined);
          }}
        />
      )}
    </>
  );
}
