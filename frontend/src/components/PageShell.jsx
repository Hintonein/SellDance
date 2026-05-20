export default function PageShell({ title, description, children }) {
  return (
    <section className="page-shell">
      <header>
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      {children}
    </section>
  );
}
