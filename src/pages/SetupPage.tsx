import { useState } from "react";
import {
  Button,
  Caption1,
  Field,
  Input,
  Title3,
  tokens,
} from "@fluentui/react-components";
import { setup } from "../api";
import AuthLayout from "../components/AuthLayout";

export default function SetupPage({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await setup(password);
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      <div>
        <Title3>Welcome</Title3>
        <Caption1
          style={{
            display: "block",
            marginTop: tokens.spacingVerticalXS,
            color: tokens.colorNeutralForeground3,
          }}
        >
          Set up your admin access to get started.
        </Caption1>
      </div>
      <Field label="Password" validationState={error ? "error" : undefined}>
        <Input
          type="password"
          placeholder="At least 8 characters"
          value={password}
          onChange={(_, d) => setPassword(d.value)}
        />
      </Field>
      <Field
        label="Confirm password"
        validationState={error ? "error" : undefined}
        validationMessage={error || undefined}
      >
        <Input
          type="password"
          placeholder="Repeat password"
          value={confirm}
          onChange={(_, d) => setConfirm(d.value)}
          onKeyDown={(e) => e.key === "Enter" && void handleCreate()}
        />
      </Field>
      <Button
        appearance="primary"
        disabled={loading || !password || !confirm}
        onClick={() => void handleCreate()}
      >
        {loading ? "Creating…" : "Create password"}
      </Button>
    </AuthLayout>
  );
}
