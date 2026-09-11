import { Link } from "react-router";
import { useShell } from "@sandbox/web-ui";

export default function Home() {
  const { me, session } = useShell();
  const granted = new Set(me.permissions);
  return (
    <section>
      <h2>ホーム</h2>
      <p>
        {session.tenant.slug} の {session.service.name} に {me.role} としてログインしています。
      </p>
      <table>
        <thead>
          <tr>
            <th>権限</th>
            <th>付与</th>
          </tr>
        </thead>
        <tbody>
          {me.service.permissions.map((permission) => (
            <tr key={permission}>
              <td>{permission}</td>
              <td>{granted.has(permission) ? "yes" : "no"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <Link to="/posts">投稿一覧へ</Link>
      </p>
    </section>
  );
}
