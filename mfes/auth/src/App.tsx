import { FormEvent, useState } from "react";
import { identityApi, setSession } from "@erp/shared";

export default function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await identityApi.login(email, password);
      setSession(res.token, res.user, res.menu_permissions, res.refresh_token);
      window.location.href = "/producao/produtos";
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login">
      <form className="card" onSubmit={onSubmit}>
        <h1>ERP</h1>
        <p className="muted">Entre com sua conta</p>
        <div className="field" style={{ marginTop: 16 }}>
          <label>E-mail</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label>Senha</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
        </div>
        {error && <p className="error">{error}</p>}
        <button style={{ marginTop: 16, width: "100%" }} disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
