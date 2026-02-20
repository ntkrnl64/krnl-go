import { useState } from "react";
import {
  Button,
  Caption1,
  Field,
  Input,
  Text,
  Title3,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import {
  ArrowRightRegular,
  CheckmarkCircleRegular,
} from "@fluentui/react-icons";
import { createLink, logout } from "../api";
import AuthLayout from "../components/AuthLayout";
import CopyButton from "../components/CopyButton";
import LinkSlug from "../components/LinkSlug";

const useStyles = makeStyles({
  heading: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
  },
  preview: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    flexWrap: "wrap",
  },
  previewDest: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  footerRow: {
    display: "flex",
    gap: tokens.spacingHorizontalS,
    alignItems: "center",
    flexWrap: "wrap",
  },
  successBody: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalL,
  },
  successIcon: {
    color: tokens.colorPaletteGreenForeground1,
    fontSize: "40px",
  },
  successSlug: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
  },
  successDest: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    wordBreak: "break-all",
  },
});

export default function CreateLinkPage({
  id,
  onLogout,
}: {
  id: string;
  onLogout: () => void;
}) {
  const styles = useStyles();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<{ id: string; url: string } | null>(
    null,
  );

  const origin = window.location.origin;
  const shortUrl = `${origin}/${created?.id ?? id}`;

  async function handleCreate() {
    setError("");
    if (!url) {
      setError("URL is required");
      return;
    }
    setLoading(true);
    try {
      const link = await createLink({ id, url });
      setCreated({ id: link.id, url: link.url });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create link");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await logout();
    onLogout();
  }

  if (created) {
    return (
      <AuthLayout>
        <div className={styles.successBody}>
          <CheckmarkCircleRegular className={styles.successIcon} />
          <div>
            <Title3>Link created</Title3>
            <Caption1
              style={{
                display: "block",
                marginTop: tokens.spacingVerticalXS,
                color: tokens.colorNeutralForeground3,
              }}
            >
              Your short link is live.
            </Caption1>
          </div>
          <div className={styles.successSlug}>
            <LinkSlug id={created.id} size="lg" />
            <span className={styles.successDest}>→ {created.url}</span>
          </div>
          <div className={styles.footerRow}>
            <CopyButton text={shortUrl} size="medium" />
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              {shortUrl}
            </Text>
          </div>
          <Button appearance="secondary" as="a" href="/">
            Admin panel
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className={styles.heading}>
        <Title3>Claim this link</Title3>
        <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
          <LinkSlug id={id} size="sm" /> is available — set a destination to
          claim it.
        </Caption1>
      </div>

      <Field
        label="Destination URL"
        required
        validationState={error ? "error" : undefined}
        validationMessage={error || undefined}
      >
        <Input
          placeholder="https://example.com"
          value={url}
          onChange={(_, d) => setUrl(d.value)}
          onKeyDown={(e) => e.key === "Enter" && void handleCreate()}
        />
      </Field>

      {url && (
        <div className={styles.preview}>
          <LinkSlug id={id} size="sm" />
          <ArrowRightRegular
            style={{ fontSize: "12px", color: tokens.colorNeutralForeground3 }}
          />
          <span className={styles.previewDest}>{url}</span>
        </div>
      )}

      <div className={styles.footerRow}>
        <Button
          appearance="primary"
          disabled={loading || !url}
          onClick={() => void handleCreate()}
        >
          {loading ? "Creating…" : "Create link"}
        </Button>
        <Button appearance="subtle" onClick={() => void handleLogout()}>
          Sign out
        </Button>
      </div>
    </AuthLayout>
  );
}
