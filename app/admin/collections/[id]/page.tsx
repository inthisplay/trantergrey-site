import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CollectionVideoPicker } from '@/components/CollectionVideoPicker';
import { SiteHeader } from '@/components/SiteHeader';
import { requireAdminPage } from '@/lib/admin-auth';
import { getVimeoLibrary } from '@/lib/vimeo-library';
import { getWorkCollection } from '@/lib/work-collections';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> };

export default async function CollectionEditorPage({ params, searchParams }: Props) {
  await requireAdminPage('/admin/collections');
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [collection, library] = await Promise.all([getWorkCollection(id), getVimeoLibrary()]);
  if (!collection) notFound();
  const candidates = (library?.videos ?? []).map(({ id: videoId, title, customTitle, client, thumbnailUrl, libraryStatus }) => ({ id: videoId, title, customTitle, client, thumbnailUrl, libraryStatus }));
  return <main className="admin-detail"><SiteHeader adminArea /><section><p className="eyebrow">Private control room / collection</p><h1>{collection.name.split(' ').slice(0, 2).join(' ')}<br /><em>edit.</em></h1><Link className="admin-back" href="/admin/collections">← All collections</Link>{query.error && <p className="admin-form-error">{query.error}</p>}<div className="collection-editor-actions"><a className="connect-button" href={`/${collection.slug}`} target="_blank" rel="noreferrer">Open shared page ↗</a><p>Unlisted and excluded from search indexing—not password protected.</p></div><form className="collection-form collection-settings" action={`/api/admin/collections/${collection.id}/settings`} method="post"><p className="eyebrow">Collection settings</p><label><span>Name</span><input name="name" required maxLength={100} defaultValue={collection.name} /></label><label><span>Share URL</span><div className="collection-slug-input"><i>/</i><input name="slug" maxLength={72} defaultValue={collection.slug} /></div></label><label className="collection-checkbox"><input type="checkbox" name="includePublished" defaultChecked={collection.includePublished} /><span><b>Include all published Work videos</b><i>Switch this off to make a completely hand-picked page.</i></span></label><button className="connect-button">Save settings</button></form>{library ? <CollectionVideoPicker collectionId={collection.id} initialIds={collection.videoIds} videos={candidates} /> : <p className="admin-empty">The Vimeo library has not been imported yet.</p>}</section></main>;
}
