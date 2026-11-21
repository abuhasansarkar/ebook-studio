import { PageLoader } from "@/components/ui/misc";

/**
 * The route-level loading boundary for the studio.
 *
 * Next.js streams this in while a segment resolves, so the shell does not
 * blank out during navigation.
 */
export default function AppLoading() {
  return <PageLoader label="Loading your studio…" />;
}
