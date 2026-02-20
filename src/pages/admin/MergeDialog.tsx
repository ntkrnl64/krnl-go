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
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { CheckmarkRegular } from "@fluentui/react-icons";
import { mergeLinks } from "../../api";

const useStyles = makeStyles({
  description: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    paddingTop: tokens.spacingVerticalS,
  },
  result: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingVerticalS,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    marginTop: tokens.spacingVerticalS,
  },
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMerged: () => void;
}

export default function MergeDialog({ open, onOpenChange, onMerged }: Props) {
  const styles = useStyles();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<number | null>(null);

  function handleClose() {
    if (result !== null) onMerged();
    setResult(null);
    onOpenChange(false);
  }

  async function handleMerge() {
    setLoading(true);
    try {
      const { merged } = await mergeLinks();
      setResult(merged);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(_, d) => {
        if (!d.open) handleClose();
      }}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Merge existing links</DialogTitle>
          <DialogContent>
            <div className={styles.description}>
              <Body1>
                Scans all links and consolidates any that share the same
                destination URL. The oldest link in each duplicate group is kept
                as the primary; the rest become aliases.
              </Body1>
              {result !== null && (
                <div className={styles.result}>
                  <CheckmarkRegular
                    style={{ color: tokens.colorPaletteGreenForeground1 }}
                  />
                  <Text>
                    {result === 0
                      ? "No duplicate links found."
                      : `${result} duplicate ${result === 1 ? "link" : "links"} merged into aliases.`}
                  </Text>
                </div>
              )}
            </div>
          </DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary" onClick={handleClose}>
                {result !== null ? "Close" : "Cancel"}
              </Button>
            </DialogTrigger>
            {result === null && (
              <Button
                appearance="primary"
                disabled={loading}
                onClick={() => void handleMerge()}
              >
                {loading ? "Merging…" : "Merge"}
              </Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
