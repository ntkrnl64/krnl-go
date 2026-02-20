import { useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  Field,
  Input,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { changePassword } from "../../api";

const useStyles = makeStyles({
  form: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    paddingTop: tokens.spacingVerticalS,
  },
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ChangePasswordDialog({ open, onOpenChange }: Props) {
  const styles = useStyles();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function reset() {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError("");
  }

  async function handleSave() {
    setError("");
    if (!current || !next || !confirm) {
      setError("All fields are required");
      return;
    }
    if (next.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    if (next !== confirm) {
      setError("New passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await changePassword(current, next);
      onOpenChange(false);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to change password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(_, d) => {
        if (!d.open) reset();
        onOpenChange(d.open);
      }}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Change password</DialogTitle>
          <DialogContent>
            <div className={styles.form}>
              <Field
                label="Current password"
                required
                validationState={error ? "error" : undefined}
                validationMessage={error || undefined}
              >
                <Input
                  type="password"
                  value={current}
                  onChange={(_, d) => setCurrent(d.value)}
                />
              </Field>
              <Field label="New password" required hint="At least 8 characters">
                <Input
                  type="password"
                  value={next}
                  onChange={(_, d) => setNext(d.value)}
                />
              </Field>
              <Field label="Confirm new password" required>
                <Input
                  type="password"
                  value={confirm}
                  onChange={(_, d) => setConfirm(d.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleSave();
                  }}
                />
              </Field>
            </div>
          </DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary">Cancel</Button>
            </DialogTrigger>
            <Button
              appearance="primary"
              disabled={loading || !current || !next || !confirm}
              onClick={() => void handleSave()}
            >
              {loading ? "Saving…" : "Save"}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
