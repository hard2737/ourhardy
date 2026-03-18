import { readdir, readFile } from "fs/promises";
import path from "path";
import { marked } from "marked";
import styles from "../../page.module.css";
import docStyles from "./doc.module.css";

interface DocEntry {
  slug: string;
  title: string;
  html: string;
}

async function getDocs(): Promise<DocEntry[]> {
  const dir = path.join(process.cwd(), "src/app/pages/hottub");
  const files = await readdir(dir);
  const mdFiles = files.filter((f) => f.endsWith(".md")).sort();

  return Promise.all(
    mdFiles.map(async (filename) => {
      const content = await readFile(path.join(dir, filename), "utf-8");
      const slug = filename.replace(/\.md$/, "").toLowerCase();
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : filename.replace(/\.md$/, "");
      const html = await marked(content);
      return { slug, title, html };
    })
  );
}

export default async function HottubPage() {
  const docs = await getDocs();

  return (
    <div className={styles.page}>
      <main className={`${styles.main} ${docStyles.main}`}>
        <nav className={docStyles.index}>
          <h2 className={docStyles.indexTitle}>Contents</h2>
          <ul className={docStyles.indexList}>
            {docs.map((doc) => (
              <li key={doc.slug}>
                <a href={`#${doc.slug}`}>{doc.title}</a>
              </li>
            ))}
          </ul>
        </nav>
        {docs.map((doc) => (
          <section key={doc.slug} id={doc.slug} className={docStyles.doc}>
            <div
              className={docStyles.content}
              dangerouslySetInnerHTML={{ __html: doc.html }}
            />
          </section>
        ))}
      </main>
    </div>
  );
}
