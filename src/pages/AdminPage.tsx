import { useCallback, useEffect, useState } from "react";
import {
  AddRegular,
  LinkRegular,
  LockClosedRegular,
  SearchRegular,
  SettingsRegular,
  SignOutRegular,
} from "@fluentui/react-icons";
import {
  Button,
  Caption1,
  Input,
  Spinner,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import {
  type CreateLinkResult,
  type ShortLink,
  listLinks,
  logout,
} from "../api";
import { CODE_FONT } from "../components/LinkSlug";
import ChangePasswordDialog from "./admin/ChangePasswordDialog";
import DeleteDialog from "./admin/DeleteDialog";
import EditLinkDialog from "./admin/EditLinkDialog";
import LinksTable from "./admin/LinksTable";
import NewLinkDialog from "./admin/NewLinkDialog";
import SettingsDialog from "./admin/SettingsDialog";

const useStyles = makeStyles({
  page: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: `14px ${tokens.spacingHorizontalXXL}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    position: "sticky",
    top: "0",
    zIndex: "100",
  },
  brand: {
    fontFamily: CODE_FONT,
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorBrandForeground1,
    letterSpacing: "-0.01em",
  },
  headerRight: {
    display: "flex",
    gap: tokens.spacingHorizontalS,
    alignItems: "center",
  },
  content: {
    flex: "1",
    padding: `${tokens.spacingVerticalXL} ${tokens.spacingHorizontalXXL}`,
    maxWidth: "1200px",
    width: "100%",
    margin: "0 auto",
    boxSizing: "border-box",
  },
  statsBar: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXXL,
    marginBottom: tokens.spacingVerticalXL,
    paddingBottom: tokens.spacingVerticalL,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  stat: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  statDivider: {
    width: "1px",
    height: "32px",
    backgroundColor: tokens.colorNeutralStroke2,
  },
  searchRow: {
    marginBottom: tokens.spacingVerticalL,
  },
  center: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "200px",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: tokens.spacingVerticalM,
    paddingTop: "80px",
    paddingBottom: "80px",
  },
  emptyIcon: {
    fontSize: "48px",
    color: tokens.colorNeutralForeground3,
    opacity: "0.5",
  },
  tableWrap: {
    overflowX: "auto",
  },
});

interface Props {
  onLogout: () => void;
  noTokenCheck: boolean;
}

export default function AdminPage({ onLogout, noTokenCheck }: Props) {
  const styles = useStyles();
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [editLink, setEditLink] = useState<ShortLink | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    listLinks()
      .then((data) => setLinks(data))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleLogout() {
    await logout();
    onLogout();
  }

  function handleCreated(link: CreateLinkResult) {
    if (link.merged) {
      // URL already existed — update the primary link in-place (alias was added)
      setLinks((prev) => prev.map((l) => (l.id === link.id ? link : l)));
    } else {
      setLinks((prev) => [...prev, link]);
    }
  }

  const q = search.trim().toLowerCase();
  const filteredLinks = q
    ? links.filter(
        (l) =>
          l.id.toLowerCase().includes(q) ||
          l.url.toLowerCase().includes(q) ||
          (l.title ?? "").toLowerCase().includes(q) ||
          (l.aliases ?? []).some((a) => a.toLowerCase().includes(q)),
      )
    : links;

  const interstitialCount = links.filter((l) => l.interstitial === true).length;
  const origin = window.location.origin;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.brand}>krnl.go</span>
        <div className={styles.headerRight}>
          <Button
            appearance="primary"
            icon={<AddRegular />}
            onClick={() => setNewOpen(true)}
          >
            New link
          </Button>
          <Button
            appearance="subtle"
            icon={<SettingsRegular />}
            onClick={() => setSettingsOpen(true)}
          >
            Settings
          </Button>
          {!noTokenCheck && (
            <Button
              appearance="subtle"
              icon={<LockClosedRegular />}
              onClick={() => setChangePasswordOpen(true)}
            >
              Password
            </Button>
          )}
          {!noTokenCheck && (
            <Button
              appearance="subtle"
              icon={<SignOutRegular />}
              onClick={() => void handleLogout()}
            >
              Sign out
            </Button>
          )}
        </div>
      </header>

      <main className={styles.content}>
        <div className={styles.statsBar}>
          <div className={styles.stat}>
            <Text size={600} weight="semibold">
              {links.length}
            </Text>
            <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
              {links.length === 1 ? "link" : "links"}
            </Caption1>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <Text size={600} weight="semibold">
              {interstitialCount}
            </Text>
            <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
              with interstitial
            </Caption1>
          </div>
        </div>

        <div className={styles.searchRow}>
          <Input
            contentBefore={<SearchRegular />}
            placeholder="Search by ID, URL, title, or alias…"
            value={search}
            onChange={(_, d) => setSearch(d.value)}
            style={{ width: "100%", maxWidth: "400px" }}
          />
        </div>

        {loading ? (
          <div className={styles.center}>
            <Spinner />
          </div>
        ) : filteredLinks.length === 0 && links.length === 0 ? (
          <div className={styles.emptyState}>
            <LinkRegular className={styles.emptyIcon} />
            <Text
              size={500}
              weight="semibold"
              style={{ color: tokens.colorNeutralForeground2 }}
            >
              No short links yet
            </Text>
            <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
              Create your first short link to get started.
            </Caption1>
            <Button
              appearance="primary"
              icon={<AddRegular />}
              style={{ marginTop: tokens.spacingVerticalS }}
              onClick={() => setNewOpen(true)}
            >
              New link
            </Button>
          </div>
        ) : filteredLinks.length === 0 ? (
          <div className={styles.emptyState}>
            <Text
              size={500}
              weight="semibold"
              style={{ color: tokens.colorNeutralForeground2 }}
            >
              No results for "{search}"
            </Text>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <LinksTable
              links={filteredLinks}
              origin={origin}
              onEdit={(link) => setEditLink(link)}
              onDelete={(id) => setDeleteId(id)}
            />
          </div>
        )}
      </main>

      <NewLinkDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={handleCreated}
      />
      <EditLinkDialog
        link={editLink}
        onClose={() => setEditLink(null)}
        onUpdated={(updated) =>
          setLinks((prev) =>
            prev.map((l) => (l.id === updated.id ? updated : l)),
          )
        }
      />
      <DeleteDialog
        id={deleteId}
        onClose={() => setDeleteId(null)}
        onDeleted={(id) => setLinks((prev) => prev.filter((l) => l.id !== id))}
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <ChangePasswordDialog
        open={changePasswordOpen}
        onOpenChange={setChangePasswordOpen}
      />
    </div>
  );
}
