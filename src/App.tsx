import { useEffect, useState } from "react";
import {
  FluentProvider,
  Spinner,
  makeStyles,
  tokens,
  webDarkTheme,
} from "@fluentui/react-components";
import {
  type ResolvedLink,
  checkStatus,
  clearToken,
  getToken,
  listLinks,
  resolveLink,
} from "./api";
import LoginCard from "./components/LoginCard";
import AdminPage from "./pages/AdminPage";
import CreateLinkPage from "./pages/CreateLinkPage";
import InterstitialPage from "./pages/InterstitialPage";
import SetupPage from "./pages/SetupPage";

type AppState =
  | "loading"
  | "needs-setup"
  | "needs-login"
  | "ready"
  | "interstitial";

const shortId =
  window.location.pathname === "/" ? null : window.location.pathname.slice(1);

const useStyles = makeStyles({
  root: {
    minHeight: "100vh",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  center: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
  },
});

export default function App() {
  const styles = useStyles();
  const [state, setState] = useState<AppState>("loading");
  const [resolved, setResolved] = useState<ResolvedLink | null>(null);

  useEffect(() => {
    async function init() {
      // If visiting a short link, first check if it resolves (public, no auth needed).
      // The worker only serves the SPA here if the link has interstitial enabled —
      // direct redirects are handled server-side and never reach this code.
      if (shortId) {
        try {
          const link = await resolveLink(shortId);
          if (link) {
            setResolved(link);
            setState("interstitial");
            return;
          }
        } catch {
          // Network error — fall through to normal auth flow
        }
      }

      try {
        const { setup } = await checkStatus();
        if (!setup) {
          setState("needs-setup");
          return;
        }
        if (!getToken()) {
          setState("needs-login");
          return;
        }
        await listLinks();
        setState("ready");
      } catch {
        clearToken();
        setState("needs-login");
      }
    }
    void init();
  }, []);

  function onLogout() {
    setState("needs-login");
  }

  return (
    <FluentProvider theme={webDarkTheme}>
      <div className={styles.root}>
        {state === "loading" && (
          <div className={styles.center}>
            <Spinner size="large" />
          </div>
        )}
        {state === "interstitial" && resolved && (
          <InterstitialPage link={resolved} />
        )}
        {state === "needs-setup" && (
          <SetupPage onComplete={() => setState("needs-login")} />
        )}
        {state === "needs-login" && (
          <LoginCard onLogin={() => setState("ready")} />
        )}
        {state === "ready" && !shortId && <AdminPage onLogout={onLogout} />}
        {state === "ready" && shortId && (
          <CreateLinkPage id={shortId} onLogout={onLogout} />
        )}
      </div>
    </FluentProvider>
  );
}
