import { useState } from "react";
import {
  Body1,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { deleteLink } from "../../api";
import LinkSlug from "../../components/LinkSlug";

const useStyles = makeStyles({
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    flexWrap: "wrap",
  },
});

interface Props {
  id: string | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}

export default function DeleteDialog({ id, onClose, onDeleted }: Props) {
  const styles = useStyles();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!id) return;
    setLoading(true);
    try {
      await deleteLink(id);
      onDeleted(id);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={id !== null} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>
            <span className={styles.titleRow}>
              Delete {id && <LinkSlug id={id} size="md" />}?
            </span>
          </DialogTitle>
          <DialogContent>
            <Body1 style={{ color: tokens.colorNeutralForeground2 }}>
              This cannot be undone. The short link will stop working
              immediately.
            </Body1>
          </DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary">Cancel</Button>
            </DialogTrigger>
            <Button
              appearance="primary"
              disabled={loading}
              onClick={() => void handleDelete()}
            >
              {loading ? "Deleting…" : "Delete"}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
