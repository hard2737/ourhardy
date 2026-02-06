import Image from "next/image";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <Image
          className={styles.logo}
          src="/smashrock.svg"
          alt="SmashRock logo"
          width={704}
          height={368}
          priority
        />
        <div className={styles.intro}>
          this space intentionally left blank
        </div>
      </main>
      <footer className={styles.footer}>
        <p className={styles.copyRight} data-year={new Date().getFullYear()}>
          &copy; {new Date().getFullYear()} David Hardy. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
