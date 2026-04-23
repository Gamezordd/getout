import { observer } from "mobx-react-lite";
import { useRouter } from "next/router";
import GroupSession from "../components/GroupSession";
import useRedirections from "../hooks/useRedirections";

function HomePage() {
  const router = useRouter();
  useRedirections();

  return (
    <GroupSession
      onBack={() => void router.replace("/dashboard")}
      onLockedVenue={() => {
        const sessionId = typeof router.query.sessionId === "string" ? router.query.sessionId : null;
        if (sessionId) {
          void router.replace({ pathname: "/final", query: { sessionId } });
        }
      }}
    />
  );
}

export default observer(HomePage);
