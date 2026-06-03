import { redirect } from "next/navigation";

/**
 * The standalone script-detail page was consolidated into the /practice library
 * (browse + manage + scene preview now live in one place). This route is kept as
 * a redirect so old links, bookmarks, and deep-links (post-upload, new scene,
 * the editor's Back button) preselect the script in the library instead of
 * landing on a duplicate page.
 */
export default async function ScriptDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/practice?script=${id}`);
}
