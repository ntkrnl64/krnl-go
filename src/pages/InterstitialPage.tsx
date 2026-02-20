import { useEffect, useState } from "react";
import {
  Button,
  Caption1,
  ProgressBar,
  Title3,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { ArrowRightRegular } from "@fluentui/react-icons";
import { type ResolvedLink } from "../api";
import AuthLayout from "../components/AuthLayout";

const useStyles = makeStyles({
  body: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalL,
  },
  destBox: {
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    wordBreak: "break-all",
    fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
  },
  countdownRow: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
  },
  actions: {
    display: "flex",
    gap: tokens.spacingHorizontalS,
    flexWrap: "wrap",
  },
});

export default function InterstitialPage({ link }: { link: ResolvedLink }) {
  const styles = useStyles();
  const totalMs = (link.redirectDelay ?? 0) * 1000;
  const [msLeft, setMsLeft] = useState(totalMs);
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    if (!totalMs || cancelled) return;

    const start = Date.now();
    const id = setInterval(() => {
      const remaining = totalMs - (Date.now() - start);
      if (remaining <= 0) {
        clearInterval(id);
        window.location.href = link.url;
        setMsLeft(0);
      } else {
        setMsLeft(remaining);
      }
    }, 50);

    return () => clearInterval(id);
  }, [totalMs, link.url, cancelled]);

  const showCountdown = totalMs > 0 && !cancelled;

  return (
    <AuthLayout>
      <div className={styles.body}>
        <div>
          <Title3>{link.title}</Title3>
          <Caption1
            style={{
              display: "block",
              marginTop: tokens.spacingVerticalXS,
              color: tokens.colorNeutralForeground3,
            }}
          >
            {link.description}
          </Caption1>
        </div>

        <div>
          <Caption1
            style={{
              display: "block",
              marginBottom: tokens.spacingVerticalXS,
              color: tokens.colorNeutralForeground3,
            }}
          >
            You are being redirected to:
          </Caption1>
          <div className={styles.destBox}>{link.url}</div>
        </div>

        {showCountdown && (
          <div className={styles.countdownRow}>
            <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
              Redirecting in {Math.ceil(msLeft / 1000)}s…
            </Caption1>
            <ProgressBar value={msLeft / totalMs} />
          </div>
        )}

        <div className={styles.actions}>
          <Button
            appearance="primary"
            icon={<ArrowRightRegular />}
            iconPosition="after"
            as="a"
            href={link.url}
          >
            Continue
          </Button>
          {showCountdown ? (
            <Button appearance="subtle" onClick={() => setCancelled(true)}>
              Cancel
            </Button>
          ) : (
            <Button appearance="subtle" onClick={() => history.back()}>
              Go back
            </Button>
          )}
        </div>
      </div>
    </AuthLayout>
  );
}
