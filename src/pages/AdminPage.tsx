import { useCallback, useEffect, useState } from "react";
import {
  AddRegular,
  DeleteRegular,
  DismissRegular,
  LinkRegular,
  LockClosedRegular,
  MergeRegular,
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
  deleteLink,
  listLinks,
  logout,
  mergeLinks,
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
  actionBar: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    marginBottom: tokens.spacingVerticalL,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  actionSep: {
    width: "1px",
    height: "20px",
    backgroundColor: tokens.colorNeutralStroke2,
    margin: `0 ${tokens.spacingHorizontalXS}`,
    flexShrink: "0",
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

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

  const allVisibleSelected =
    filteredLinks.length > 0 && filteredLinks.every((l) => selected.has(l.id));

  function handleSelectionChange(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function handleSelectAll(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      filteredLinks.forEach((l) =>
        checked ? next.add(l.id) : next.delete(l.id),
      );
      return next;
    });
  }

  async function handleBulkMerge() {
    setBulkLoading(true);
    try {
      await mergeLinks([...selected]);
      setSelected(new Set());
      load();
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleBulkDelete() {
    setBulkLoading(true);
    try {
      await Promise.all([...selected].map((id) => deleteLink(id)));
      setLinks((prev) => prev.filter((l) => !selected.has(l.id)));
      setSelected(new Set());
    } finally {
      setBulkLoading(false);
    }
  }

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

        {selected.size > 0 && (
          <div className={styles.actionBar}>
            <Caption1
              style={{
                color: tokens.colorNeutralForeground2,
                whiteSpace: "nowrap",
              }}
            >
              {selected.size} {selected.size === 1 ? "link" : "links"} selected
            </Caption1>
            <div className={styles.actionSep} />
            <Button
              size="small"
              appearance="subtle"
              icon={bulkLoading ? <Spinner size="tiny" /> : <MergeRegular />}
              disabled={bulkLoading}
              onClick={() => void handleBulkMerge()}
            >
              Merge
            </Button>
            <Button
              size="small"
              appearance="subtle"
              icon={<DeleteRegular />}
              disabled={bulkLoading}
              onClick={() => void handleBulkDelete()}
            >
              Delete
            </Button>
            <div style={{ flex: "1" }} />
            <Button
              size="small"
              appearance="subtle"
              onClick={() => handleSelectAll(!allVisibleSelected)}
            >
              {allVisibleSelected ? "Deselect all" : "Select all"}
            </Button>
            <Button
              size="small"
              appearance="transparent"
              icon={<DismissRegular />}
              aria-label="Clear selection"
              onClick={() => setSelected(new Set())}
            />
          </div>
        )}

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
              selected={selected}
              onSelectionChange={handleSelectionChange}
              onSelectAll={handleSelectAll}
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
