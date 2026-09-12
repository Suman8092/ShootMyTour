import React, { useEffect, useState, createContext, useContext } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
type Row = Record<string, any>;
const Ctx = createContext<any>(null);
let csrf = "";
async function api(path: string, method = "GET", data?: any) {
  const r = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const result = await r.json();
  if (!r.ok) throw Error(result.error || "Something went wrong");
  return result;
}
const money = (v: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format((v || 0) / 100);
const when = (v: string) =>
  new Date(v).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const day = (v: string) =>
  new Date(v).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
const label = (s: string) =>
  (s || "")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (x) => x.toUpperCase());
function go(url: string) {
  history.pushState({}, "", url);
  window.dispatchEvent(new Event("popstate"));
  window.scrollTo({ top: 0, behavior: "instant" as any });
}
function Link({ to, children, className = "", ...props }: any) {
  return (
    <a
      href={to}
      className={className}
      {...props}
      onClick={(e) => {
        if (!e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          go(to);
        }
      }}
    >
      {children}
    </a>
  );
}
function Icon({ name = "arrow", size = 20 }: any) {
  const paths: Record<string, any> = {
    arrow: (
      <>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </>
    ),
    camera: (
      <>
        <path d="M4 6h4l2-3h4l2 3h4v14H4z" />
        <circle cx="12" cy="12" r="4" />
      </>
    ),
    pin: (
      <>
        <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1114 0z" />
        <circle cx="12" cy="10" r="2" />
      </>
    ),
    check: <path d="M5 12l4 4L19 6" />,
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 3v4m10-4v4M3 11h18" />
      </>
    ),
    search: (
      <>
        <circle cx="10" cy="10" r="7" />
        <path d="M15 15l6 6" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    star: <path d="m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" />,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    shield: (
      <>
        <path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.arrow}
    </svg>
  );
}
function Badge({ status }: any) {
  return (
    <span
      className={
        "badge " +
        ([
          "APPROVED",
          "CONFIRMED",
          "COMPLETED",
          "SUCCESS",
          "PROCESSED",
          "SENT",
        ].includes(status)
          ? "positive"
          : [
                "REJECTED",
                "FAILED",
                "PAYMENT_FAILED",
                "CANCELLED_BY_USER",
                "CANCELLED_BY_PHOTOGRAPHER",
              ].includes(status)
            ? "negative"
            : "")
      }
    >
      {label(status)}
    </span>
  );
}
function Photo({ src, city = "India", className = "", caption = "" }: any) {
  const [bad, setBad] = useState(false);
  return (
    <div className={"photo " + className}>
      <div className="photo-fallback">
        <span>INDIA, IN FOCUS</span>
        <strong>{city}</strong>
        <span>A new place. Your own story.</span>
      </div>
      {src && !bad && (
        <img
          src={src}
          alt={caption || `${city} destination · illustrative stock image`}
          loading="lazy"
          onError={() => setBad(true)}
        />
      )}
      <span className="photo-caption">{caption || city + " · India"}</span>
    </div>
  );
}
function Loader() {
  return (
    <div className="skeletons" aria-label="Loading" role="status">
      {[1, 2, 3].map((x) => (
        <div className="skeleton" key={x} />
      ))}
    </div>
  );
}
function Empty({
  title = "Nothing here yet",
  text = "Your next story starts with a little exploring.",
  to,
  action = "Explore photographers",
}: any) {
  return (
    <div className="empty">
      <Icon name="camera" size={32} />
      <h3>{title}</h3>
      <p>{text}</p>
      {to && (
        <Link to={to} className="button">
          {action}
          <Icon />
        </Link>
      )}
    </div>
  );
}
function ErrorView({ error, retry }: any) {
  return (
    <div className="error-block" role="alert">
      <h3>We couldn’t load this page</h3>
      <p>{error}</p>
      {retry && <button onClick={retry}>Try again</button>}
    </div>
  );
}
function useLoad(path: string, version = 0) {
  const [data, set] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    set(null);
    setError("");
    api(path)
      .then((d) => {
        if (live) set(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [path, version]);
  return { data, error };
}
function Form({
  onSubmit,
  children,
  button = "Save changes",
  className = "",
}: any) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className={"form " + className}
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const form = e.currentTarget;
        const values = Object.fromEntries(new FormData(form));
        setBusy(true);
        setError("");
        try {
          await onSubmit(values, form);
        } catch (e: any) {
          setError(e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <button className="button" disabled={busy} type="submit">
        {busy ? "Please wait…" : button}
        <Icon name={busy ? "clock" : "arrow"} />
      </button>
    </form>
  );
}
function Field({
  name,
  title,
  type = "text",
  value = "",
  options,
  required = true,
  min,
  max,
  placeholder,
  ...props
}: any) {
  return (
    <label className="field">
      <span>{title}</span>
      {type === "textarea" ? (
        <textarea
          name={name}
          defaultValue={value}
          required={required}
          {...props}
        />
      ) : options ? (
        <select name={name} defaultValue={value} required={required} {...props}>
          {options.map((o: any) => (
            <option key={o.value ?? o} value={o.value ?? o}>
              {o.label ?? o}
            </option>
          ))}
        </select>
      ) : (
        <input
          name={name}
          type={type}
          defaultValue={value}
          required={required}
          min={min}
          max={max}
          placeholder={placeholder}
          {...props}
        />
      )}
    </label>
  );
}
function Dialog({ title, children, onClose }: any) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", key);
    const previous = document.activeElement as HTMLElement;
    const target = document.querySelector(".dialog") as HTMLElement;
    target?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const nodes = target?.querySelectorAll<HTMLElement>(
        "button,input,select,textarea,a[href]",
      );
      if (!nodes?.length) return;
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="section-head">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function Header() {
  const { user, config, logout } = useContext(Ctx),
    [open, setOpen] = useState(false);
  return (
    <>
      {config?.demo && (
        <div className="demo-bar">
          LOCAL DEMO{" "}
          <span>
            Fictional profiles & illustrative imagery. No real charges in demo
            checkout.
          </span>
        </div>
      )}
      <header className="site-header">
        <Link to="/" className="brand" aria-label="ShootMyTour Home">
          <img src="/logo.png" alt="ShootMyTour" className="brand-logo-img" />
        </Link>
        <nav
          aria-label="Main navigation"
          className={open ? "open" : ""}
          onClick={() => setOpen(false)}
        >
          <Link to="/photographers">Find a photographer</Link>
          <Link to="/cities">Destinations</Link>
          <Link to="/how-it-works">How it works</Link>
          {user ? (
            <>
              <Link
                to={
                  user.role === "USER"
                    ? "/dashboard"
                    : user.role === "PHOTOGRAPHER"
                      ? "/photographer/dashboard"
                      : "/admin"
                }
                className="nav-account"
              >
                My workspace
              </Link>
              <button className="text-button" onClick={logout}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/login">Sign in</Link>
              <Link
                to="/photographer-register"
                className="button small outline"
              >
                Join as a photographer
                <Icon />
              </Link>
            </>
          )}
        </nav>
        <button
          className="icon-button mobile-menu"
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <Icon name={open ? "close" : "menu"} />
        </button>
      </header>
    </>
  );
}
function Footer() {
  return (
    <footer>
      <div className="footer-main">
        <div>
          <Link to="/" className="brand" aria-label="ShootMyTour Home">
            <img src="/logo.png" alt="ShootMyTour" className="brand-logo-img" />
          </Link>
          <p>
            Go somewhere new.
            <br />
            Keep something beautiful.
          </p>
        </div>
        <div>
          <h4>Explore</h4>
          <Link to="/cities">Destinations</Link>
          <Link to="/photographers">Photographers</Link>
          <Link to="/pricing">Packages & pricing</Link>
        </div>
        <div>
          <h4>Be part of it</h4>
          <Link to="/photographer-register">Become a photographer</Link>
          <Link to="/about">Our story</Link>
          <Link to="/contact">Contact & support</Link>
        </div>
        <div>
          <h4>The details</h4>
          <Link to="/faq">FAQs</Link>
          <Link to="/terms">Terms & policies</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/refund-policy">Cancellations & refunds</Link>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} ShootMyTour</span>
        <span>Made for the moments that matter. · All shoot times in IST</span>
      </div>
    </footer>
  );
}
function SearchBox({ cities = [], initial = {} }: any) {
  return (
    <Form
      className="search-box"
      button="Find photographers"
      onSubmit={(v: any) => {
        const params = new URLSearchParams();
        Object.entries(v).forEach(([k, val]) => {
          if (val) params.set(k, String(val));
        });
        go("/photographers?" + params);
      }}
    >
      <Field
        name="city"
        title="Where are you headed?"
        value={initial.city}
        options={[
          { value: "", label: "Choose a destination" },
          ...cities.map((c: any) => ({ value: c.slug, label: c.name })),
        ]}
        required={false}
      />
      <Field
        name="date"
        title="When’s your trip?"
        type="date"
        value={initial.date}
        min={new Date().toISOString().slice(0, 10)}
        required={false}
      />
      <Field
        name="category"
        title="What’s the occasion?"
        value={initial.category}
        options={[
          { value: "", label: "Any occasion" },
          "Couple",
          "Family",
          "Travel",
          "Solo",
          "Wedding",
          "Creator",
        ]}
        required={false}
      />
    </Form>
  );
}
function PhotographerCard({ p }: any) {
  const { config } = useContext(Ctx);
  return (
    <article className="photographer-card">
      <Link to={"/photographers/" + p.id}>
        <Photo src={p.image} city={p.city} />
      </Link>
      <div className="card-content">
        <div className="eyebrow">
          <Icon name="pin" size={14} />
          {p.city}{" "}
          <span className="verified">
            <Icon name="check" size={14} />
            {config?.demo ? "Demo approved" : "Approved"}
          </span>
        </div>
        <Link to={"/photographers/" + p.id}>
          <h3>{p.name}</h3>
        </Link>
        <p className="muted">Natural moments. Local perspective.</p>
        <div className="card-bottom">
          <span>
            {p.rating ? (
              <>
                <Icon name="star" size={14} /> {p.rating}{" "}
                <small>({p.review_count})</small>
              </>
            ) : (
              <small>New to ShootMyTour</small>
            )}
          </span>
          <Link to={"/photographers/" + p.id}>
            <small>from </small>
            <strong>
              {p.starting_price ? money(p.starting_price) : "Ask for packages"}
            </strong>{" "}
            <Icon size={16} />
          </Link>
        </div>
      </div>
    </article>
  );
}
function Home() {
  const { cities } = useContext(Ctx),
    { data } = useLoad("/api/photographers");
  return (
    <>
      <section className="hero wrap">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="tiny-line" />
            YOUR TRIP. BEAUTIFULLY CAPTURED.
          </div>
          <h1>
            Be in the
            <br />
            moment.
            <br />
            <em>We’ll frame it.</em>
          </h1>
          <p>
            Find a local photographer who knows the light, the little lanes, and
            how to bring out the real you.
          </p>
          <Link to="/photographers" className="text-link">
            Find your photographer <Icon />
          </Link>
          <div className="hero-proof">
            <Icon name="shield" />
            <span>
              Reviewed profiles <span className="dot">·</span> Clear packages{" "}
              <span className="dot">·</span> Local know-how
            </span>
          </div>
        </div>
        <div className="hero-art">
          <Photo
            src="https://images.unsplash.com/photo-1599661046827-dacff0c0f09a?auto=format&fit=crop&w=1400&q=85"
            city="Jaipur"
            className="hero-photo"
          />
          <div className="hero-note">
            <span>01 / THE PINK CITY</span>
            <h3>Some places stay with you.</h3>
            <p>Make sure the memories do, too.</p>
          </div>
          <div className="vertical-note">
            EXPLORE INDIA, ONE FRAME AT A TIME
          </div>
        </div>
      </section>
      <section className="wrap search-wrap">
        <SearchBox cities={cities} />
      </section>
      <div className="promise-strip wrap">
        <span>
          <Icon name="check" /> Profiles reviewed by our team
        </span>
        <span>
          <Icon name="camera" /> Edited, high-resolution photos
        </span>
        <span>
          <Icon name="shield" /> Payment verification built in
        </span>
      </div>
      <section className="wrap section">
        <div className="section-head">
          <div>
            <div className="eyebrow">THE DESTINATION IS JUST THE BEGINNING</div>
            <h2>Where will your story take you?</h2>
          </div>
          <Link to="/cities" className="text-link">
            All destinations <Icon />
          </Link>
        </div>
        <div className="destination-grid">
          {cities
            .filter((c: any) =>
              ["jaipur", "goa", "udaipur", "agra"].includes(c.slug),
            )
            .sort(
              (a: any, b: any) =>
                ["jaipur", "goa", "udaipur", "agra"].indexOf(a.slug) -
                ["jaipur", "goa", "udaipur", "agra"].indexOf(b.slug),
            )
            .map((c: any, i: number) => (
              <Link
                key={c.id}
                to={"/cities/" + c.slug}
                className={"destination destination-" + i}
              >
                <span className="destination-number">0{i + 1}</span>
                <div>
                  <small>{c.state.toUpperCase()}</small>
                  <h3>{c.name}</h3>
                  <span>
                    Find your frame <Icon size={16} />
                  </span>
                </div>
              </Link>
            ))}
        </div>
      </section>
      <section className="steps-section">
        <div className="wrap">
          <div className="eyebrow">LESS PLANNING. MORE LIVING.</div>
          <h2>
            A beautiful memory,
            <br />
            without the complicated part.
          </h2>
          <div className="steps">
            {[
              [
                "01",
                "Pick your place",
                "Choose a destination and a photographer whose work feels like you.",
              ],
              [
                "02",
                "Make it yours",
                "Choose a package, reserve a time, and tell us what you have in mind.",
              ],
              [
                "03",
                "Show up. Be yourself.",
                "Enjoy the shoot. Receive your edited gallery after your photographer delivers it.",
              ],
            ].map(([n, t, d]) => (
              <div key={n}>
                <span className="step-number">{n}</span>
                <h3>{t}</h3>
                <p>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="wrap section">
        <div className="section-head">
          <div>
            <div className="eyebrow">PEOPLE BEHIND THE LENS</div>
            <h2>A local eye. A personal connection.</h2>
          </div>
          <Link to="/photographers" className="text-link">
            Meet the photographers <Icon />
          </Link>
        </div>
        <p className="demo-note">
          Demo collection — these sample profiles are fictional, not real
          service providers.
        </p>
        <div className="cards-grid">
          {data ? (
            data.items
              .slice(0, 3)
              .map((p: any) => <PhotographerCard key={p.id} p={p} />)
          ) : (
            <Loader />
          )}
        </div>
      </section>
      <section className="join-section wrap">
        <div>
          <div className="eyebrow">FOR THE PEOPLE BEHIND THE CAMERA</div>
          <h2>
            Your city. Your craft.
            <br />
            <em>A world of new stories.</em>
          </h2>
          <p>
            Build your profile, set your packages, and turn local knowledge into
            meaningful work.
          </p>
        </div>
        <Link to="/photographer-register" className="button light">
          Become a photographer <Icon />
        </Link>
      </section>
      <section className="wrap section faq-home">
        <div>
          <div className="eyebrow">A LITTLE CLARITY</div>
          <h2>
            Good questions.
            <br />
            Simple answers.
          </h2>
        </div>
        <FaqItems />
      </section>
    </>
  );
}
const faqs = [
  [
    "How does booking work?",
    "Choose an approved photographer, a package and an available time. Your slot is held for 10 minutes while you pay. A verified payment sends your request to the photographer for acceptance.",
  ],
  [
    "What is included in a package?",
    "Each package lists the duration, number of edited photos, delivery timeline and price. These details are saved with your booking so later package changes do not change your purchase.",
  ],
  [
    "What happens if my photographer declines?",
    "The booking is marked rejected and the time is released. Our admin team reviews your captured payment and initiates the refund. A rejection alone does not mean a refund has already been processed.",
  ],
  [
    "When will I receive my photos?",
    "Your package states the delivery timeline. After the shoot, the photographer adds a secure gallery link to your booking. You receive an in-app notification and a queued email update.",
  ],
];
function FaqItems() {
  return (
    <div className="faq-list">
      {faqs.map(([q, a]) => (
        <details key={q}>
          <summary>
            {q}
            <span>+</span>
          </summary>
          <p>{a}</p>
        </details>
      ))}
    </div>
  );
}
function Listing() {
  const { cities } = useContext(Ctx);
  const params = new URLSearchParams(location.search),
    { data, error } = useLoad("/api/photographers?" + params);
  const selectedCity = cities.find((c: any) => c.slug === params.get("city"));
  return (
    <section className="wrap section">
      <div className="eyebrow">FIND YOUR KIND OF PHOTOGRAPHER</div>
      <h1 className="page-title">
        {selectedCity
          ? "Your story in " + selectedCity.name
          : "A local lens, wherever you go."}
      </h1>
      <p className="lede">
        Good company. Great photographs. A little more of you in every frame.
      </p>
      <SearchBox cities={cities} initial={Object.fromEntries(params)} />
      <div className="listing-layout">
        <aside className="filter-panel">
          <h3>Refine your search</h3>
          <Form
            button="Apply filters"
            onSubmit={(v: any) => {
              const p = new URLSearchParams(location.search);
              p.delete("page");
              for (const [k, val] of Object.entries(v)) {
                val ? p.set(k, String(val)) : p.delete(k);
              }
              go("/photographers?" + p);
            }}
          >
            <Field
              name="price"
              title="Maximum starting price (₹)"
              type="number"
              min="1"
              value={params.get("price") || ""}
              required={false}
              placeholder="Any budget"
            />
            <Field
              name="duration"
              title="Package duration"
              value={params.get("duration") || ""}
              options={[
                { value: "", label: "Any duration" },
                { value: "60", label: "1 hour" },
                { value: "120", label: "2 hours" },
                { value: "240", label: "4 hours" },
              ]}
              required={false}
            />
            <Field
              name="rating"
              title="Minimum rating"
              value={params.get("rating") || ""}
              options={[
                { value: "", label: "Include new photographers" },
                { value: "4", label: "4 stars & above" },
                { value: "4.5", label: "4.5 stars & above" },
              ]}
              required={false}
            />
            <Field
              name="sort"
              title="Sort by"
              value={params.get("sort") || ""}
              options={[
                { value: "", label: "Featured first" },
                { value: "price_asc", label: "Price: low to high" },
                { value: "price_desc", label: "Price: high to low" },
                { value: "rating", label: "Highest rated" },
              ]}
              required={false}
            />
          </Form>
          <button className="text-button" onClick={() => go("/photographers")}>
            Clear all filters
          </button>
          <div className="aside-note">
            <Icon name="shield" />
            <p>
              Only admin-approved, active photographer profiles appear here.
            </p>
          </div>
        </aside>
        <div>
          <div className="results-line">
            <span>
              {data
                ? `${data.total} photographer${data.total === 1 ? "" : "s"} found`
                : "Finding your next photographer…"}
            </span>
            <span className="muted">All prices in INR</span>
          </div>
          {error ? (
            <ErrorView error={error} />
          ) : !data ? (
            <Loader />
          ) : data.items.length ? (
            <>
              <div className="cards-grid listing-cards">
                {data.items.map((p: any) => (
                  <PhotographerCard key={p.id} p={p} />
                ))}
              </div>
              {data.total > 12 && (
                <div className="pager">
                  <button
                    disabled={data.page === 1}
                    onClick={() => {
                      params.set("page", String(data.page - 1));
                      go("/photographers?" + params);
                    }}
                  >
                    Previous
                  </button>
                  <span>Page {data.page}</span>
                  <button
                    disabled={data.page * 12 >= data.total}
                    onClick={() => {
                      params.set("page", String(data.page + 1));
                      go("/photographers?" + params);
                    }}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          ) : (
            <Empty
              title="A new destination, not a dead end."
              text="No photographers match these filters yet. Try another destination or clear your filters."
              to="/photographers"
              action="Reset search"
            />
          )}
        </div>
      </div>
    </section>
  );
}
function Cities() {
  const { cities } = useContext(Ctx),
    slug = location.pathname.split("/")[2];
  if (slug) {
    const c = cities.find((c: any) => c.slug === slug);
    return (
      <section className="wrap section">
        <div className="eyebrow">DESTINATION GUIDE · INDIA</div>
        <h1 className="page-title">
          {c?.name || label(slug)}, through your eyes.
        </h1>
        <p className="lede">
          A new perspective on {c?.state || "your next destination"}. Find a
          local photographer and plan a shoot that feels personal.
        </p>
        <Link className="button" to={"/photographers?city=" + slug}>
          Explore photographers <Icon />
        </Link>
        <div className="info-grid section">
          <div className="panel">
            <h3>Plan the light</h3>
            <p>
              Ask your photographer about the best time and locations for your
              shoot.
            </p>
          </div>
          <div className="panel">
            <h3>Keep it comfortable</h3>
            <p>
              Bring water, comfortable shoes and a change of clothes if your
              package allows.
            </p>
          </div>
          <div className="panel">
            <h3>Make it yours</h3>
            <p>
              Share your ideas in the booking notes, then coordinate in your
              private booking thread.
            </p>
          </div>
        </div>
      </section>
    );
  }
  return (
    <section className="wrap section">
      <div className="eyebrow">SOMEWHERE NEW. SOMETHING TIMELESS.</div>
      <h1 className="page-title">Find your next backdrop.</h1>
      <p className="lede">Start with a place. Leave with a story.</p>
      <div className="destination-grid all-destinations">
        {cities.map((c: any, i: number) => (
          <Link
            to={"/cities/" + c.slug}
            className={"destination destination-" + (i % 4)}
            key={c.id}
          >
            <span className="destination-number">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div>
              <small>{c.state}</small>
              <h3>{c.name}</h3>
              <span>
                Explore destination <Icon />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
function Profile({ pid }: any) {
  const { data: p, error } = useLoad("/api/photographers/" + pid),
    [lightbox, setLightbox] = useState<any>(null);
  if (error)
    return (
      <div className="wrap section">
        <ErrorView error={error} />
      </div>
    );
  if (!p)
    return (
      <div className="wrap section">
        <Loader />
      </div>
    );
  return (
    <section className="wrap section">
      <Link to={"/photographers?city=" + p.city_slug} className="breadcrumb">
        ← Photographers in {p.city}
      </Link>
      <div className="profile-heading">
        <div>
          <div className="eyebrow">
            <Icon name="pin" size={16} />
            {p.city} · {p.languages}
          </div>
          <h1 className="page-title">Meet {p.name}.</h1>
          <p className="lede">A little local knowledge. A lot of heart.</p>
        </div>
        <div className="profile-meta">
          <Badge status={p.verification} />
          <span>{p.experience} years of experience</span>
          <span>
            {p.rating
              ? `${p.rating} / 5 · ${p.review_count} reviews`
              : "New profile · no reviews yet"}
          </span>
        </div>
      </div>
      <div className="profile-gallery">
        <Photo src={p.image} city={p.city} className="profile-main-photo" />
        {p.portfolio.slice(0, 2).map((x: any) => (
          <button
            className="gallery-button"
            onClick={() => setLightbox(x)}
            key={x.id}
          >
            <Photo src={x.image} city={p.city} caption={x.caption} />
          </button>
        ))}
      </div>
      <div className="profile-body">
        <div>
          <section className="profile-section">
            <div className="eyebrow">BEHIND THE LENS</div>
            <h2>
              Good photographs start
              <br />
              with a real connection.
            </h2>
            <p>{p.bio}</p>
            <div className="tag-row">
              {p.categories.split(",").map((x: string) => (
                <span key={x} className="tag">
                  {x.trim()}
                </span>
              ))}
            </div>
          </section>
          <section className="profile-section">
            <div className="section-head">
              <h2>Your kind of shoot.</h2>
              <span className="muted">Full payment at booking</span>
            </div>
            <div className="package-list">
              {p.packages.map((pk: any, i: number) => (
                <article
                  className={
                    "package-card " + (i === 1 ? "featured-package" : "")
                  }
                  key={pk.id}
                >
                  <div className="package-top">
                    <div>
                      <span className="eyebrow">
                        {pk.duration / 60}-HOUR EXPERIENCE
                      </span>
                      <h3>{pk.title}</h3>
                    </div>
                    <strong>{money(pk.price)}</strong>
                  </div>
                  <p>{pk.description}</p>
                  <div className="package-features">
                    <span>
                      <Icon name="camera" size={16} />
                      {pk.photos} edited photos
                    </span>
                    <span>
                      <Icon name="clock" size={16} />
                      {pk.delivery_days}-day delivery
                    </span>
                  </div>
                  <Link
                    className={"button " + (i === 1 ? "" : "outline")}
                    to={"/book/" + p.id + "?package=" + pk.id}
                  >
                    Choose {pk.title}
                    <Icon />
                  </Link>
                </article>
              ))}
            </div>
            {!p.packages.length && (
              <Empty
                title="Packages coming soon"
                text="This photographer has not published an approved package yet."
              />
            )}
          </section>
          <section className="profile-section">
            <h2>Available days</h2>
            <p>
              All times are shown in India Standard Time. Choose a package to
              reserve a slot.
            </p>
            <div className="tag-row">
              {p.slots.slice(0, 10).map((s: any) => (
                <span className="tag" key={s.id}>
                  <Icon name="calendar" size={14} />
                  {day(s.start_at)}
                </span>
              ))}
            </div>
            {!p.slots.length && (
              <p className="muted">
                No upcoming availability. Please check again later.
              </p>
            )}
          </section>
          <section className="profile-section">
            <h2>Stories from past shoots.</h2>
            {p.reviews.length ? (
              p.reviews.map((r: any) => (
                <article className="review" key={r.id}>
                  <div className="section-head">
                    <strong>{r.name}</strong>
                    <span>{"★".repeat(r.rating)}</span>
                  </div>
                  <p>{r.comment || "Reviewed a completed shoot."}</p>
                </article>
              ))
            ) : (
              <Empty
                title="The first story could be yours."
                text="Reviews are only accepted from customers after a completed booking."
              />
            )}
          </section>
          <section>
            <h2>More from the portfolio</h2>
            <div className="portfolio-grid">
              {p.portfolio.map((x: any) => (
                <button
                  className="gallery-button"
                  key={x.id}
                  onClick={() => setLightbox(x)}
                >
                  <Photo src={x.image} city={p.city} caption={x.caption} />
                </button>
              ))}
            </div>
          </section>
        </div>
        <aside className="booking-aside">
          <div className="eyebrow">MAKE A LITTLE ROOM FOR MEMORIES</div>
          <h3>
            Your time in {p.city},<br />
            beautifully framed.
          </h3>
          <p>
            Choose your package, find your time, and let the adventure begin.
          </p>
          <div className="aside-price">
            <small>Packages from</small>
            <strong>{money(p.starting_price)}</strong>
          </div>
          <Link className="button" to={"/book/" + p.id}>
            Check availability <Icon />
          </Link>
          <ul className="check-list">
            <li>
              <Icon name="check" /> Server-verified payment
            </li>
            <li>
              <Icon name="check" /> Clear deliverables & pricing
            </li>
            <li>
              <Icon name="check" /> Private booking thread
            </li>
          </ul>
          <small>
            Booking is confirmed after payment verification and photographer
            acceptance.
          </small>
        </aside>
      </div>
      {lightbox && (
        <Dialog
          title={lightbox.caption || "Portfolio"}
          onClose={() => setLightbox(null)}
        >
          <Photo src={lightbox.image} city={p.city} />
        </Dialog>
      )}
    </section>
  );
}
function AuthPage() {
  const { setUser, cities, config } = useContext(Ctx),
    path = location.pathname,
    register = ["/register", "/photographer-register"].includes(path),
    photo = path === "/photographer-register",
    forgot = path === "/forgot-password",
    reset = path === "/reset-password",
    title = forgot
      ? "Let’s get you back in."
      : reset
        ? "A fresh start."
        : register
          ? photo
            ? "Your next chapter starts here."
            : "Make room for memories."
          : "Welcome back.";
  const searchParams = new URLSearchParams(location.search);
  const oauthError = searchParams.get("error");
  return (
    <section className="auth-layout wrap">
      <div className="auth-story">
        <div className="eyebrow">SHOOTMYTOUR</div>
        <h2>
          The best souvenir
          <br />
          is a moment
          <br />
          <em>you’re actually in.</em>
        </h2>
        <p>
          From little lanes to wide-open horizons.
          <br />
          Find your frame, wherever you go.
        </p>
        <div className="auth-location">
          <Icon name="pin" /> MADE FOR INDIA. MADE FOR YOU.
        </div>
      </div>
      <div className="auth-card">
        <div className="eyebrow">
          {photo
            ? "FOR PHOTOGRAPHERS"
            : register
              ? "BEGIN YOUR STORY"
              : "YOUR SHOOTMYTOUR ACCOUNT"}
        </div>
        <h1>{title}</h1>
        <p>
          {forgot
            ? "Enter your email to request a password reset link."
            : reset
              ? "Choose a password with at least 10 characters."
              : photo
                ? "Share your craft. We’ll help you find your audience."
                : register
                  ? "A little exploring starts with a simple hello."
                  : "Your next beautiful memory is waiting."}
        </p>
        {oauthError && (
          <div className="oauth-error-banner">
            <Icon name="clock" /> {decodeURIComponent(oauthError)}
          </div>
        )}
        {!forgot && !reset && (
          <div className="social-auth-group">
            <a href="/api/auth/oauth/google" className="btn-social btn-google">
              <svg className="social-icon" viewBox="0 0 24 24" width="18" height="18">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Continue with Google</span>
            </a>
            <a href="/api/auth/oauth/github" className="btn-social btn-github">
              <svg className="social-icon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              <span>Continue with GitHub</span>
            </a>
            <div className="auth-separator">
              <span>or continue with email</span>
            </div>
          </div>
        )}
        <Form
          key={path}
          button={
            forgot
              ? "Send reset link"
              : reset
                ? "Reset password"
                : register
                  ? "Create account"
                  : "Sign in"
          }
          onSubmit={async (v: any) => {
            if (forgot) {
              const r = await api("/api/auth/forgot-password", "POST", v);
              useToast(r.message);
              return;
            }
            if (reset) {
              await api("/api/auth/reset-password", "POST", {
                ...v,
                token: new URLSearchParams(location.search).get("token"),
              });
              useToast("Password reset. Sign in with your new password.");
              go("/login");
              return;
            }
            if (register) {
              if (v.password !== v.confirm_password)
                throw Error("Passwords do not match");
              await api(
                "/api/auth/" + (photo ? "register-photographer" : "register"),
                "POST",
                v,
              );
            }
            const result = await api("/api/auth/login", "POST", v);
            csrf = result.csrf;
            setUser(result.user);
            const redirect = new URLSearchParams(location.search).get("next");
            go(
              redirect?.startsWith("/") && !redirect.startsWith("//")
                ? redirect
                : result.user.role === "USER"
                  ? "/dashboard"
                  : result.user.role === "PHOTOGRAPHER"
                    ? "/photographer/dashboard"
                    : "/admin",
            );
          }}
        >
          {register && (
            <Field
              name="name"
              title={photo ? "Your name / studio name" : "Full name"}
              maxLength={100}
              autoComplete="name"
            />
          )}
          {!reset && (
            <Field
              name="email"
              title="Email address"
              type="email"
              autoComplete="email"
            />
          )}
          {register && (
            <Field
              name="phone"
              title="Phone number"
              type="tel"
              required={false}
              maxLength={30}
            />
          )}{" "}
          {!forgot && (
            <Field
              name="password"
              title="Password"
              type="password"
              minLength={register || reset ? 10 : 1}
              maxLength={128}
              autoComplete={
                register || reset ? "new-password" : "current-password"
              }
            />
          )}{" "}
          {register && (
            <Field
              name="confirm_password"
              title="Confirm password"
              type="password"
              minLength={10}
              autoComplete="new-password"
            />
          )}
          {photo && (
            <>
              <Field
                name="city_id"
                title="Your city"
                options={cities.map((c: any) => ({
                  value: c.id,
                  label: c.name,
                }))}
              />
              <Field
                name="experience"
                title="Years of experience"
                type="number"
                min={0}
                max={80}
                value={0}
              />
            </>
          )}
          {register && (
            <p className="small-copy">
              By creating an account, you agree to the{" "}
              <Link to="/terms">terms</Link> and{" "}
              <Link to="/privacy">privacy policy</Link>. Local demo policies are
              drafts, not launch-ready legal terms.
            </p>
          )}
        </Form>
        {!register && !forgot && !reset && (
          <Link to="/forgot-password" className="text-link auth-link">
            Forgot password?
          </Link>
        )}
        <p className="auth-link">
          {register
            ? "Already have an account? "
            : forgot || reset
              ? "Remember your password? "
              : "New here? "}
          <Link to={register || forgot || reset ? "/login" : "/register"}>
            {register || forgot || reset ? "Sign in" : "Create an account"}
          </Link>
        </p>
        {config?.demo && !register && !forgot && !reset && (
          <div className="demo-login">
            <strong>Try the local demo</strong>
            <p>
              Password for all demo accounts: <code>Capture@123</code>
            </p>
            <div className="demo-buttons">
              {[
                ["Customer", "customer"],
                ["Photographer", "photographer"],
                ["Admin", "admin"],
              ].map(([t, e]) => (
                <button
                  key={e}
                  onClick={() => {
                    const email = document.querySelector(
                        "[name=email]",
                      ) as HTMLInputElement,
                      password = document.querySelector(
                        "[name=password]",
                      ) as HTMLInputElement;
                    email.value = e + "@shootmytour.test";
                    password.value = "Capture@123";
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
let toastFn: (message: string) => void = () => {};
function useToast(message: string) {
  toastFn(message);
}
function Guard({ roles, children }: any) {
  const { user } = useContext(Ctx);
  if (!user)
    return (
      <section className="wrap section">
        <Empty
          title="Your story needs a sign-in."
          text="Sign in to reserve a shoot or open your workspace."
          to={
            "/login?next=" +
            encodeURIComponent(location.pathname + location.search)
          }
          action="Sign in to continue"
        />
      </section>
    );
  if (roles && !roles.includes(user.role))
    return (
      <section className="wrap section">
        <Empty
          title="This workspace isn’t for this account."
          text="Sign in with the right role to continue."
          to="/"
          action="Back to home"
        />
      </section>
    );
  return children;
}
function BookingForm({ pid }: any) {
  const { data: p, error } = useLoad("/api/photographers/" + pid),
    [selected, setSelected] = useState(
      new URLSearchParams(location.search).get("package") || "",
    );
  if (error) return <ErrorView error={error} />;
  if (!p) return <Loader />;
  const pk = p.packages.find((x: any) => x.id === selected) || p.packages[0];
  if (!pk) return <Empty title="No approved packages" />;
  const slots = p.slots.filter(
    (s: any) =>
      (Date.parse(s.end_at) - Date.parse(s.start_at)) / 60000 >= pk.duration,
  );
  return (
    <section className="wrap section">
      <Link className="breadcrumb" to={"/photographers/" + pid}>
        ← Back to profile
      </Link>
      <div className="eyebrow">
        01 DETAILS → 02 PAYMENT → 03 PHOTOGRAPHER CONFIRMATION
      </div>
      <h1 className="page-title">Let’s make it a memory.</h1>
      <div className="checkout-layout">
        <div className="panel">
          <h2>Your shoot, your way.</h2>
          <Form
            button="Reserve & continue to payment"
            onSubmit={async (v: any) => {
              const b = await api("/api/bookings", "POST", {
                ...v,
                package_id: pk.id,
              });
              go("/checkout/" + b.id);
            }}
          >
            <label className="field">
              <span>Choose your package</span>
              <select
                value={pk.id}
                onChange={(e) => setSelected(e.target.value)}
              >
                {p.packages.map((x: any) => (
                  <option key={x.id} value={x.id}>
                    {x.title} · {money(x.price)} · {x.duration / 60} hours
                  </option>
                ))}
              </select>
            </label>
            <Field
              key={pk.id}
              name="slot_id"
              title="Available time (IST)"
              options={[
                {
                  value: "",
                  label: slots.length
                    ? "Select a time"
                    : "No matching slots available",
                },
                ...slots.map((s: any) => ({
                  value: s.id,
                  label: when(s.start_at) + " · " + pk.duration / 60 + " hours",
                })),
              ]}
            />
            <Field
              name="location"
              title="Meeting point / shoot location"
              placeholder="e.g. Hawa Mahal entrance, Jaipur"
              maxLength={500}
            />
            <div className="form-grid">
              <Field
                name="people"
                title="Number of people"
                type="number"
                min={1}
                max={30}
                value={2}
              />
              <Field
                name="shoot_type"
                title="Occasion"
                options={[
                  "Couple",
                  "Family",
                  "Travel",
                  "Solo",
                  "Wedding",
                  "Creator",
                ]}
              />
            </div>
            <Field
              name="notes"
              title="Anything we should know?"
              type="textarea"
              placeholder="Your ideas, preferences or accessibility needs"
              required={false}
              maxLength={2000}
            />
            <Field
              name="coupon"
              title="Coupon code (optional)"
              placeholder="FIRSTFRAME in demo"
              required={false}
              maxLength={50}
            />
            <p className="small-copy">
              Your slot is held for 10 minutes during checkout. Final pricing
              and coupon eligibility are calculated on the server. Photographer
              acceptance is required after payment.
            </p>
          </Form>
        </div>
        <aside className="panel summary-panel">
          <div className="eyebrow">YOUR SHOOT AT A GLANCE</div>
          <h2>{p.name}</h2>
          <p>
            <Icon name="pin" size={16} />
            {p.city}
          </p>
          <hr />
          <h3>{pk.title}</h3>
          <div className="summary-row">
            <span>Duration</span>
            <strong>{pk.duration / 60} hours</strong>
          </div>
          <div className="summary-row">
            <span>Edited photos</span>
            <strong>{pk.photos}</strong>
          </div>
          <div className="summary-row">
            <span>Delivery</span>
            <strong>{pk.delivery_days} days</strong>
          </div>
          <hr />
          <div className="summary-row total">
            <span>Package price</span>
            <strong>{money(pk.price)}</strong>
          </div>
          <p className="small-copy">
            Any valid discount will be shown on the next screen before you pay.
          </p>
          <Link to="/refund-policy" className="text-link">
            Cancellation & refund policy <Icon size={16} />
          </Link>
        </aside>
      </div>
    </section>
  );
}
async function loadCheckout() {
  if ((window as any).Razorpay) return;
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = resolve;
    script.onerror = () =>
      reject(Error("Could not load Razorpay checkout. Check your connection."));
    document.head.appendChild(script);
  });
}
function Checkout({ bid }: any) {
  const { user, config } = useContext(Ctx),
    { data: b, error } = useLoad("/api/bookings/" + bid),
    [busy, setBusy] = useState(false),
    [err, setErr] = useState("");
  async function pay(outcome = "success") {
    setBusy(true);
    setErr("");
    try {
      const p = await api("/api/payments/create-order", "POST", {
        booking_id: bid,
      });
      if (p.gateway === "DEMO") {
        await api("/api/payments/demo", "POST", { payment_id: p.id, outcome });
        if (outcome === "failed")
          throw Error(
            "Demo decline simulated. You can retry before the hold expires.",
          );
        useToast("Demo payment verified. Awaiting photographer acceptance.");
        go("/dashboard/bookings/" + bid);
      } else {
        await loadCheckout();
        const rz = new (window as any).Razorpay({
          key: p.key_id,
          amount: p.amount,
          currency: "INR",
          name: "ShootMyTour",
          description: "Travel photography booking",
          order_id: p.order_id,
          prefill: { name: user.name, email: user.email, contact: user.phone },
          theme: { color: "#1e4237" },
          handler: async (result: any) => {
            try {
              await api("/api/payments/verify", "POST", result);
              go("/dashboard/bookings/" + bid);
            } catch (e: any) {
              setErr(e.message);
            } finally {
              setBusy(false);
            }
          },
          modal: { ondismiss: () => setBusy(false) },
        });
        rz.on("payment.failed", () => {
          setErr(
            "Payment failed. Try again or check your booking for updates.",
          );
          setBusy(false);
        });
        rz.open();
        return;
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (error) return <ErrorView error={error} />;
  if (!b) return <Loader />;
  return (
    <section className="wrap section narrow">
      <div className="eyebrow">02 / PAYMENT</div>
      <h1 className="page-title">One step closer.</h1>
      <div className="panel">
        <Badge status={b.status} />
        <h2>{b.package_title} photography session</h2>
        <p>
          {when(b.start_at)} IST
          <br />
          {b.location}
        </p>
        <hr />
        <div className="summary-row">
          <span>Package</span>
          <strong>{money(b.total)}</strong>
        </div>
        <div className="summary-row">
          <span>Discount</span>
          <strong>−{money(b.discount)}</strong>
        </div>
        <div className="summary-row total">
          <span>Pay now</span>
          <strong>{money(b.amount)}</strong>
        </div>
        <p className="small-copy">
          Reservation expires at{" "}
          {b.hold_until
            ? new Date(b.hold_until).toLocaleTimeString("en-IN")
            : "—"}
          . Final confirmation follows photographer acceptance.
        </p>
        {config?.paymentMode === "DEMO" && (
          <div className="notice">
            <strong>Test checkout — no real money moves.</strong>
            <p>
              This action creates a simulated payment in your local database.
            </p>
          </div>
        )}
        {err && (
          <div className="form-error" role="alert">
            {err}
          </div>
        )}
        <div className="button-stack">
          <button
            className="button"
            disabled={busy || b.status !== "PENDING_PAYMENT"}
            onClick={() => pay()}
          >
            {busy
              ? "Opening checkout…"
              : config?.paymentMode === "DEMO"
                ? "Simulate successful payment"
                : "Pay securely with Razorpay"}
            <Icon name="shield" />
          </button>
          {config?.paymentMode === "DEMO" && (
            <button
              className="button outline"
              disabled={busy || b.status !== "PENDING_PAYMENT"}
              onClick={() => pay("failed")}
            >
              Test a failed payment
            </button>
          )}
          <Link to={"/dashboard/bookings/" + b.id} className="text-link">
            View booking instead <Icon />
          </Link>
        </div>
      </div>
    </section>
  );
}
function BookingDetail({ bid }: any) {
  const { user, refresh, version } = useContext(Ctx),
    { data: b, error } = useLoad("/api/bookings/" + bid, version),
    [dialog, setDialog] = useState("");
  if (error) return <ErrorView error={error} />;
  if (!b) return <Loader />;
  const customer = b.user_id === user.id,
    photo = user.role === "PHOTOGRAPHER";
  const mutate = async (path: string, body: any = {}, method = "PATCH") => {
    await api(path, method, body);
    setDialog("");
    refresh();
    useToast("Booking updated");
  };
  return (
    <section className="wrap section">
      <Link
        className="breadcrumb"
        to={
          customer
            ? "/dashboard/bookings"
            : photo
              ? "/photographer/bookings"
              : "/admin/bookings"
        }
      >
        ← Back to bookings
      </Link>
      <div className="section-head">
        <div>
          <div className="eyebrow">
            BOOKING · {bid.slice(0, 8).toUpperCase()}
          </div>
          <h1 className="page-title">Your {b.package_title} experience.</h1>
        </div>
        <Badge status={b.status} />
      </div>
      <div className="checkout-layout">
        <div>
          <section className="panel">
            <h2>The plan</h2>
            <div className="detail-grid">
              <div>
                <small>WHEN · IST</small>
                <strong>{when(b.start_at)}</strong>
              </div>
              <div>
                <small>WHERE</small>
                <strong>{b.location}</strong>
              </div>
              <div>
                <small>THE EXPERIENCE</small>
                <strong>
                  {b.duration / 60} hours · {b.photos} photos
                </strong>
              </div>
              <div>
                <small>THE PEOPLE</small>
                <strong>
                  {b.people} · {b.shoot_type}
                </strong>
              </div>
            </div>
            {b.notes && (
              <div className="notice">
                <strong>Your notes</strong>
                <p>{b.notes}</p>
              </div>
            )}
            <p>
              Gallery delivery target: {b.delivery_days} days after the shoot.
            </p>
            {b.delivery_url && (
              <a
                className="button"
                href={b.delivery_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open delivered gallery <Icon />
              </a>
            )}
            <div className="action-row">
              {customer && b.status === "PENDING_PAYMENT" && (
                <Link className="button" to={"/checkout/" + b.id}>
                  Complete payment <Icon />
                </Link>
              )}
              {customer &&
                [
                  "PENDING_PAYMENT",
                  "PENDING_PHOTOGRAPHER_CONFIRMATION",
                  "CONFIRMED",
                ].includes(b.status) && (
                  <button
                    className="button outline"
                    onClick={() => setDialog("cancel")}
                  >
                    Cancel booking
                  </button>
                )}
              {photo && b.status === "PENDING_PHOTOGRAPHER_CONFIRMATION" && (
                <>
                  <button
                    className="button"
                    onClick={() => setDialog("accept")}
                  >
                    Accept request
                  </button>
                  <button
                    className="button outline"
                    onClick={() => setDialog("reject")}
                  >
                    Decline request
                  </button>
                </>
              )}
              {photo && b.status === "CONFIRMED" && (
                <>
                  <button
                    className="button"
                    onClick={() => setDialog("complete")}
                  >
                    Mark shoot complete
                  </button>
                  <button
                    className="button outline"
                    onClick={() => setDialog("photo-cancel")}
                  >
                    Cancel shoot
                  </button>
                </>
              )}
              {photo && b.status === "COMPLETED" && (
                <button className="button" onClick={() => setDialog("deliver")}>
                  Deliver gallery
                </button>
              )}
              {customer && b.status === "COMPLETED" && (
                <button
                  className="button outline"
                  onClick={() => setDialog("review")}
                >
                  Leave a review
                </button>
              )}
            </div>
          </section>
          <section className="panel spaced">
            <h2>A conversation about your shoot.</h2>
            <p className="muted">
              Private to the booking participants and platform admins. Refresh
              to see new messages.
            </p>
            <div className="messages">
              {b.messages.map((m: any) => (
                <div
                  key={m.id}
                  className={
                    "message " + (m.sender_id === user.id ? "mine" : "")
                  }
                >
                  <strong>{m.name}</strong>
                  <p>{m.message}</p>
                  <small>{when(m.created_at)}</small>
                </div>
              ))}
              {!b.messages.length && (
                <p className="muted">
                  Start with a hello. Share meeting details, inspiration or
                  questions.
                </p>
              )}
            </div>
            <Form
              button="Send message"
              onSubmit={async (v: any, f: any) => {
                await api("/api/bookings/" + bid + "/messages", "POST", v);
                f.reset();
                refresh();
              }}
            >
              <Field
                name="message"
                title="Message"
                type="textarea"
                maxLength={2000}
              />
            </Form>
          </section>
        </div>
        <aside>
          <div className="panel">
            <h3>Payment summary</h3>
            <div className="summary-row">
              <span>Package</span>
              <strong>{money(b.total)}</strong>
            </div>
            <div className="summary-row">
              <span>Discount</span>
              <strong>−{money(b.discount)}</strong>
            </div>
            <div className="summary-row total">
              <span>Total</span>
              <strong>{money(b.amount)}</strong>
            </div>
            {b.payments.map((p: any) => (
              <div className="payment-line" key={p.id}>
                <span>
                  {p.gateway} · {money(p.amount)}
                </span>
                <Badge status={p.status} />
              </div>
            ))}
            {b.refunds.map((r: any) => (
              <div className="notice" key={r.id}>
                <strong>Refund · {money(r.amount)}</strong>
                <Badge status={r.status} />
              </div>
            ))}
          </div>
          <div className="panel spaced">
            <h3>Booking timeline</h3>
            <div className="timeline">
              {b.logs.map((l: any, i: number) => (
                <div key={i}>
                  <strong>{label(l.new_status || l.action)}</strong>
                  <small>{when(l.created_at)}</small>
                  {l.note && <p>{l.note}</p>}
                </div>
              ))}
            </div>
          </div>
          <Link to="/contact" className="text-link">
            Need a hand? <Icon />
          </Link>
        </aside>
      </div>
      {dialog && (
        <Dialog title={label(dialog)} onClose={() => setDialog("")}>
          <Form
            button={
              dialog === "review" ? "Submit review" : "Confirm " + label(dialog)
            }
            onSubmit={async (v: any) => {
              if (dialog === "review")
                await mutate("/api/reviews", { ...v, booking_id: bid }, "POST");
              else if (dialog === "cancel")
                await mutate("/api/bookings/" + bid + "/cancel", v);
              else
                await mutate(
                  "/api/photographer/bookings/" +
                    bid +
                    "/" +
                    (dialog === "photo-cancel" ? "cancel" : dialog),
                  v,
                );
            }}
          >
            {dialog === "deliver" ? (
              <Field
                name="url"
                title="Secure gallery URL"
                type="url"
                placeholder="https://…"
              />
            ) : dialog === "review" ? (
              <>
                <Field
                  name="rating"
                  title="Your rating"
                  options={[5, 4, 3, 2, 1]}
                />
                <Field
                  name="comment"
                  title="Tell us about your experience"
                  type="textarea"
                  required={false}
                />
              </>
            ) : (
              <>
                <p>
                  {dialog === "complete"
                    ? "You can mark a shoot complete only after its scheduled end time."
                    : dialog === "accept"
                      ? "Accepting confirms the paid booking and reserves this time for your customer."
                      : "This releases the reserved time. Any captured payment requires admin refund review; refunds are not automatic."}
                </p>
                <Field
                  name="reason"
                  title="Note / reason"
                  type="textarea"
                  required={dialog !== "accept" && dialog !== "complete"}
                />
              </>
            )}
          </Form>
        </Dialog>
      )}
    </section>
  );
}
function BookingCards({ bookings, base = "/dashboard/bookings/" }: any) {
  return bookings.length ? (
    <div className="booking-cards">
      {bookings.map((b: any) => (
        <Link key={b.id} className="booking-card" to={base + b.id}>
          <div className="booking-date">
            <strong>
              {new Date(b.start_at).toLocaleDateString("en-IN", {
                timeZone: "Asia/Kolkata",
                day: "2-digit",
              })}
            </strong>
            <span>
              {new Date(b.start_at).toLocaleDateString("en-IN", {
                timeZone: "Asia/Kolkata",
                month: "short",
              })}
            </span>
          </div>
          <div className="booking-card-main">
            <small>
              {b.city} · {b.shoot_type}
            </small>
            <h3>
              {b.package_title} with {b.photographer}
            </h3>
            <p>
              {b.customer} · {b.duration / 60} hours · {money(b.amount)}
            </p>
          </div>
          <Badge status={b.status} />
          <Icon />
        </Link>
      ))}
    </div>
  ) : (
    <Empty
      title="Your next memory is still unwritten."
      text="Browse destinations and find a photographer for your next trip."
      to="/photographers"
    />
  );
}
function DashboardShell({ role, tab, children }: any) {
  const { user } = useContext(Ctx);
  const base =
    role === "USER"
      ? "/dashboard"
      : role === "PHOTOGRAPHER"
        ? "/photographer"
        : "/admin";
  const items =
    role === "USER"
      ? [
          "overview",
          "bookings",
          "profile",
          "payments",
          "reviews",
          "notifications",
        ]
      : role === "PHOTOGRAPHER"
        ? [
            "dashboard",
            "profile",
            "packages",
            "availability",
            "bookings",
            "portfolio",
            "reviews",
            "payouts",
            "notifications",
          ]
        : [
            "overview",
            "users",
            "photographers",
            "cities",
            "packages",
            "bookings",
            "payments",
            "reviews",
            "portfolio",
            "coupons",
            "payouts",
            "settings",
            "reports",
            "logs",
            "notifications",
          ];
  return (
    <div className="workspace wrap">
      <aside className="workspace-nav">
        <div className="workspace-person">
          <span className="avatar">{user.name.slice(0, 1)}</span>
          <div>
            <strong>{user.name}</strong>
            <small>{label(role)} workspace</small>
          </div>
        </div>
        <nav aria-label="Workspace navigation">
          {items.map((x) => (
            <Link
              key={x}
              className={tab === x ? "active" : ""}
              to={base + (x === "overview" ? "" : "/" + x)}
            >
              {label(x)}
              {tab === x && <Icon size={16} />}
            </Link>
          ))}
        </nav>
        <div className="workspace-help">
          <Icon name="shield" />
          <p>Every booking has a story. Keep yours up to date.</p>
          <Link to="/contact">Contact support →</Link>
        </div>
      </aside>
      <main className="workspace-content">
        <div className="eyebrow">YOUR SHOOTMYTOUR WORKSPACE</div>
        {children}
      </main>
    </div>
  );
}
function Stats({ items }: any) {
  return (
    <div className="stats-grid">
      {items.map(([t, v]: any) => (
        <div className="stat" key={t}>
          <small>{t}</small>
          <strong>{v}</strong>
        </div>
      ))}
    </div>
  );
}
function Notifications() {
  const { version, refresh } = useContext(Ctx),
    { data, error } = useLoad("/api/notifications", version);
  return (
    <>
      <div className="section-head">
        <h1 className="page-title">Notifications</h1>
        <button
          onClick={() =>
            api("/api/notifications/read", "PATCH")
              .then(refresh)
              .catch((e) => useToast(e.message))
          }
        >
          Mark all read
        </button>
      </div>
      {error ? (
        <ErrorView error={error} />
      ) : !data ? (
        <Loader />
      ) : data.length ? (
        data.map((n: any) => (
          <article
            className={"notification " + (!n.is_read ? "unread" : "")}
            key={n.id}
          >
            <strong>{n.title}</strong>
            <p>{n.message}</p>
            <small>{when(n.created_at)}</small>
          </article>
        ))
      ) : (
        <Empty
          title="You’re all caught up."
          text="Booking and account updates will appear here."
        />
      )}
    </>
  );
}
function CustomerDashboard() {
  const { user, version, refresh, setUser } = useContext(Ctx),
    tab = location.pathname.split("/")[2] || "overview",
    { data: bookings, error } = useLoad("/api/bookings/my", version);
  if (error) return <ErrorView error={error} />;
  return (
    <DashboardShell role="USER" tab={tab}>
      {tab === "notifications" ? (
        <Notifications />
      ) : tab === "profile" ? (
        <>
          <h1 className="page-title">A little about you.</h1>
          <div className="panel">
            <Form
              onSubmit={async (v: any) => {
                await api("/api/profile", "PATCH", v);
                setUser({ ...user, ...v });
                useToast("Profile saved");
              }}
            >
              <Field name="name" title="Full name" value={user.name} />
              <Field
                name="phone"
                title="Phone"
                value={user.phone || ""}
                required={false}
              />
              <p>Email: {user.email}</p>
            </Form>
          </div>
        </>
      ) : !bookings ? (
        <Loader />
      ) : (
        <>
          <div className="section-head">
            <div>
              <h1 className="page-title">
                {tab === "overview"
                  ? "Hello, " + user.name.split(" ")[0] + "."
                  : label(tab)}
              </h1>
              <p className="muted">
                {tab === "overview"
                  ? "Your trips, your memories, all in one place."
                  : "Keep track of your photography experiences."}
              </p>
            </div>
            <Link className="button" to="/photographers">
              Plan a shoot <Icon />
            </Link>
          </div>
          {tab === "overview" && (
            <Stats
              items={[
                ["Total bookings", bookings.length],
                [
                  "Upcoming",
                  bookings.filter(
                    (b: any) =>
                      b.status === "CONFIRMED" &&
                      b.start_at > new Date().toISOString(),
                  ).length,
                ],
                [
                  "Completed",
                  bookings.filter((b: any) => b.status === "COMPLETED").length,
                ],
              ]}
            />
          )}{" "}
          {tab === "payments" ? (
            <DataTable
              rows={bookings}
              columns={[
                "package_title",
                "photographer",
                "amount",
                "payment_status",
                "status",
              ]}
              actions={(r: any) => (
                <Link className="text-link" to={"/dashboard/bookings/" + r.id}>
                  Details →
                </Link>
              )}
            />
          ) : tab === "reviews" ? (
            <>
              <p>Only completed shoots can be reviewed, once per booking.</p>
              <BookingCards
                bookings={bookings.filter((b: any) => b.status === "COMPLETED")}
              />
            </>
          ) : (
            <>
              <h2>
                {tab === "overview" ? "Your latest stories" : "All bookings"}
              </h2>
              <BookingCards
                bookings={tab === "overview" ? bookings.slice(0, 5) : bookings}
              />
            </>
          )}
        </>
      )}
    </DashboardShell>
  );
}
function DataTable({ rows, columns, actions }: any) {
  const [query, setQuery] = useState(""),
    [page, setPage] = useState(1);
  const filtered = rows.filter((r: any) =>
      columns.some((c: string) =>
        String(r[c] ?? "")
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    ),
    visible = filtered.slice((page - 1) * 15, page * 15);
  return (
    <div className="data-table">
      <div className="table-tools">
        <label>
          <span className="sr-only">Filter table</span>
          <input
            placeholder="Search these records…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <span>{filtered.length} records</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((c: string) => (
                <th key={c}>{label(c)}</th>
              ))}
              {actions && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {visible.map((r: any, i: number) => (
              <tr key={r.id || i}>
                {columns.map((c: string) => (
                  <td key={c}>
                    {["status", "verification", "payment_status"].includes(
                      c,
                    ) ? (
                      <Badge status={r[c]} />
                    ) : [
                        "amount",
                        "price",
                        "total",
                        "commission",
                        "max_discount",
                      ].includes(c) ? (
                      money(r[c])
                    ) : [
                        "active",
                        "approved",
                        "visible",
                        "featured",
                        "blocked",
                      ].includes(c) ? (
                      r[c] ? (
                        "Yes"
                      ) : (
                        "No"
                      )
                    ) : [
                        "created_at",
                        "start_at",
                        "end_at",
                        "expires",
                      ].includes(c) ? (
                      when(r[c])
                    ) : (
                      String(r[c] ?? "—")
                    )}
                  </td>
                ))}
                {actions && (
                  <td>
                    <div className="table-actions">{actions(r)}</div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filtered.length && (
        <Empty
          title="No matching records"
          text="Try another search, or add your first record."
        />
      )}
      {filtered.length > 15 && (
        <div className="pager">
          <button disabled={page === 1} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <span>
            {page} / {Math.ceil(filtered.length / 15)}
          </span>
          <button
            disabled={page * 15 >= filtered.length}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
function PhotographerDashboard() {
  const { version, refresh, cities } = useContext(Ctx),
    tab = location.pathname.split("/")[2] || "dashboard",
    { data: w, error } = useLoad("/api/photographer/workspace", version),
    [modal, setModal] = useState<any>(null);
  const save = async (path: string, values: any, method = "POST") => {
    await api(path, method, values);
    setModal(null);
    refresh();
    useToast("Saved successfully");
  };
  if (error) return <ErrorView error={error} />;
  if (!w)
    return (
      <DashboardShell role="PHOTOGRAPHER" tab={tab}>
        <Loader />
      </DashboardShell>
    );
  const p = w.profile;
  return (
    <DashboardShell role="PHOTOGRAPHER" tab={tab}>
      {tab === "notifications" ? (
        <Notifications />
      ) : (
        <>
          <div className="section-head">
            <div>
              <h1 className="page-title">
                {tab === "dashboard" ? "Make something memorable." : label(tab)}
              </h1>
              <p className="muted">Your craft. Your schedule. Your business.</p>
            </div>
            {["packages", "availability", "portfolio"].includes(tab) && (
              <button
                className="button"
                onClick={() => setModal({ type: tab })}
              >
                Add{" "}
                {tab === "availability"
                  ? "time slot"
                  : tab === "portfolio"
                    ? "image"
                    : "package"}{" "}
                +
              </button>
            )}
          </div>
          {p.verification !== "APPROVED" && (
            <div className="notice">
              <Badge status={p.verification} />
              <p>
                Your profile must be approved by an admin to appear in search.
                Complete your profile, portfolio and packages.
              </p>
            </div>
          )}
          {tab === "dashboard" ? (
            <>
              <Stats
                items={[
                  [
                    "Booking requests",
                    w.bookings.filter(
                      (b: any) =>
                        b.status === "PENDING_PHOTOGRAPHER_CONFIRMATION",
                    ).length,
                  ],
                  [
                    "Confirmed shoots",
                    w.bookings.filter((b: any) => b.status === "CONFIRMED")
                      .length,
                  ],
                  [
                    "Paid out",
                    money(
                      w.payouts.reduce((s: number, p: any) => s + p.amount, 0),
                    ),
                  ],
                ]}
              />
              <h2>Your latest bookings</h2>
              <BookingCards
                bookings={w.bookings.slice(0, 6)}
                base="/photographer/bookings/"
              />
            </>
          ) : tab === "profile" ? (
            <div className="panel">
              <Form
                key={version}
                onSubmit={async (v: any) =>
                  save("/api/photographer/profile", v, "PATCH")
                }
              >
                <Field
                  name="city_id"
                  title="Home city"
                  value={p.city_id}
                  options={cities.map((c: any) => ({
                    value: c.id,
                    label: c.name,
                  }))}
                />
                <Field
                  name="bio"
                  title="Your story"
                  type="textarea"
                  value={p.bio}
                  required={false}
                />
                <div className="form-grid">
                  <Field
                    name="experience"
                    title="Years of experience"
                    value={p.experience}
                    type="number"
                    min={0}
                    max={80}
                  />
                  <Field
                    name="languages"
                    title="Languages"
                    value={p.languages}
                  />
                </div>
                <Field
                  name="categories"
                  title="Shoot categories (comma-separated)"
                  value={p.categories}
                />
                <p className="small-copy">
                  Profile edits trigger a fresh admin review. Your existing
                  bookings remain available.
                </p>
              </Form>
            </div>
          ) : tab === "packages" ? (
            <DataTable
              rows={w.packages}
              columns={[
                "title",
                "price",
                "duration",
                "photos",
                "delivery_days",
                "active",
                "approved",
              ]}
              actions={(r: any) => (
                <>
                  <button
                    onClick={() => setModal({ type: "packages", record: r })}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setModal({ type: "deactivate", record: r })}
                  >
                    Deactivate
                  </button>
                </>
              )}
            />
          ) : tab === "availability" ? (
            <>
              <p className="muted">
                Add date-specific availability windows. Bookings start at the
                beginning of the selected window; one window supports one
                reservation at a time.
              </p>
              <DataTable
                rows={w.slots}
                columns={["start_at", "end_at", "blocked"]}
                actions={(r: any) => (
                  <button
                    onClick={() => setModal({ type: "block", record: r })}
                  >
                    Block
                  </button>
                )}
              />
            </>
          ) : tab === "bookings" ? (
            <BookingCards
              bookings={w.bookings}
              base="/photographer/bookings/"
            />
          ) : tab === "portfolio" ? (
            <div className="portfolio-grid">
              {w.portfolio.map((r: any) => (
                <article className="panel portfolio-item" key={r.id}>
                  <Photo src={r.image} city="Portfolio" caption={r.caption} />
                  <Badge status={r.approved ? "APPROVED" : "PENDING"} />
                  <p>
                    {r.category} · {r.caption}
                  </p>
                  <button
                    onClick={() =>
                      setModal({ type: "remove-image", record: r })
                    }
                  >
                    Remove image
                  </button>
                </article>
              ))}
              {!w.portfolio.length && (
                <Empty
                  title="Your portfolio starts here."
                  text="Upload JPEG, PNG or WebP images up to 5 MB. Admin approval is required."
                />
              )}
            </div>
          ) : tab === "reviews" ? (
            <DataTable
              rows={w.reviews}
              columns={["rating", "comment", "visible", "created_at"]}
            />
          ) : tab === "payouts" ? (
            <>
              <Stats
                items={[
                  [
                    "Paid out",
                    money(
                      w.payouts.reduce((s: number, r: any) => s + r.amount, 0),
                    ),
                  ],
                  [
                    "Eligible after delivery",
                    money(
                      w.bookings
                        .filter(
                          (b: any) =>
                            b.status === "COMPLETED" &&
                            b.delivered_at &&
                            !b.payout_id,
                        )
                        .reduce(
                          (s: number, b: any) => s + b.amount - b.commission,
                          0,
                        ),
                    ),
                  ],
                ]}
              />
              <p>
                Payouts are manually transferred by the admin, then recorded
                with a bank reference. This screen does not move money.
              </p>
              <DataTable
                rows={w.payouts}
                columns={["booking_id", "amount", "reference", "created_at"]}
              />
            </>
          ) : (
            <Empty title="Workspace page not found" />
          )}
        </>
      )}
      {modal && (
        <Dialog title={label(modal.type)} onClose={() => setModal(null)}>
          <Form
            button={
              ["block", "deactivate", "remove-image"].includes(modal.type)
                ? "Confirm"
                : "Save"
            }
            onSubmit={async (v: any, form: any) => {
              const r = modal.record;
              if (modal.type === "packages")
                await save(
                  "/api/photographer/packages" + (r ? "/" + r.id : ""),
                  {
                    ...v,
                    price: Math.round(Number(v.price_rupees) * 100),
                    active: v.active === "1",
                  },
                  r ? "PATCH" : "POST",
                );
              if (modal.type === "availability")
                await save("/api/photographer/availability", {
                  start_at: v.date + "T" + v.start + ":00+05:30",
                  end_at: v.date + "T" + v.end + ":00+05:30",
                });
              if (modal.type === "portfolio") {
                const file = (
                  form.elements.namedItem("image") as HTMLInputElement
                ).files?.[0];
                if (!file) throw Error("Select an image");
                if (file.size > 5 * 1024 * 1024)
                  throw Error("Image must be under 5 MB");
                const data = await new Promise((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(reader.result);
                  reader.onerror = reject;
                  reader.readAsDataURL(file);
                });
                await save("/api/photographer/portfolio", {
                  data,
                  caption: v.caption,
                  category: v.category,
                });
              }
              if (modal.type === "block")
                await save(
                  "/api/photographer/availability/" + r.id,
                  {},
                  "DELETE",
                );
              if (modal.type === "deactivate")
                await save("/api/photographer/packages/" + r.id, {}, "DELETE");
              if (modal.type === "remove-image")
                await save("/api/photographer/portfolio/" + r.id, {}, "DELETE");
            }}
          >
            {modal.type === "packages" ? (
              <>
                <Field
                  name="title"
                  title="Package name"
                  value={modal.record?.title}
                />
                <Field
                  name="description"
                  title="Description"
                  type="textarea"
                  required={false}
                  value={modal.record?.description}
                />
                <div className="form-grid">
                  <Field
                    name="price_rupees"
                    title="Price (₹)"
                    type="number"
                    min={1}
                    max={1000000}
                    step="0.01"
                    value={modal.record ? modal.record.price / 100 : 3500}
                  />
                  <Field
                    name="duration"
                    title="Duration (minutes)"
                    type="number"
                    min={15}
                    max={720}
                    value={modal.record?.duration || 60}
                  />
                  <Field
                    name="photos"
                    title="Edited photos"
                    type="number"
                    min={1}
                    max={1000}
                    value={modal.record?.photos || 20}
                  />
                  <Field
                    name="delivery_days"
                    title="Delivery in days"
                    type="number"
                    min={1}
                    max={90}
                    value={modal.record?.delivery_days || 7}
                  />
                </div>
                <Field
                  name="active"
                  title="Availability for sale"
                  value={String(modal.record?.active ?? 1)}
                  options={[
                    { value: "1", label: "Active" },
                    { value: "0", label: "Inactive" },
                  ]}
                />
                <p className="small-copy">
                  New and edited packages require admin approval.
                </p>
              </>
            ) : modal.type === "availability" ? (
              <>
                <Field
                  name="date"
                  title="Date (India Standard Time)"
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                />
                <div className="form-grid">
                  <Field name="start" title="Start time (IST)" type="time" />
                  <Field name="end" title="End time (IST)" type="time" />
                </div>
              </>
            ) : modal.type === "portfolio" ? (
              <>
                <Field
                  name="image"
                  title="Photo (JPEG, PNG, WebP · max 5 MB)"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                />
                <Field
                  name="caption"
                  title="Caption / accessible description"
                  maxLength={200}
                />
                <Field
                  name="category"
                  title="Category"
                  options={[
                    "Travel",
                    "Couple",
                    "Family",
                    "Solo",
                    "Creator",
                    "Wedding",
                    "Commercial",
                  ]}
                />
              </>
            ) : (
              <p>
                {modal.type === "block"
                  ? "This blocks an unreserved slot. Booked or held slots cannot be changed."
                  : modal.type === "deactivate"
                    ? "The package will no longer be available for new bookings. Existing bookings are unchanged."
                    : "This image will be removed from the portfolio. This cannot be undone."}
              </p>
            )}
          </Form>
        </Dialog>
      )}
    </DashboardShell>
  );
}
function AdminDashboard() {
  const { user, version, refresh, refreshCities } = useContext(Ctx),
    tab = location.pathname.split("/")[2] || "overview",
    { data: w, error } = useLoad("/api/admin/workspace", version),
    [modal, setModal] = useState<any>(null);
  const mutate = async (path: string, data: any = {}, method = "PATCH") => {
    await api("/api/admin/" + path, method, data);
    setModal(null);
    refresh();
    refreshCities();
    useToast("Admin change saved");
  };
  const act = (path: string, data: any = {}) =>
    mutate(path, data).catch((e) => useToast(e.message));
  if (error) return <ErrorView error={error} />;
  if (!w)
    return (
      <DashboardShell role="ADMIN" tab={tab}>
        <Loader />
      </DashboardShell>
    );
  const collections: any = {
    users: ["name", "email", "role", "active"],
    photographers: ["name", "city", "verification", "featured"],
    cities: ["name", "state", "slug", "active"],
    packages: ["title", "photographer", "price", "active", "approved"],
    payments: ["booking_id", "amount", "gateway", "status", "created_at"],
    reviews: ["rating", "comment", "visible", "created_at"],
    coupons: [
      "code",
      "percent",
      "max_discount",
      "usage_limit",
      "expires",
      "active",
    ],
    payouts: ["booking_id", "amount", "reference", "created_at"],
    logs: ["action", "old_status", "new_status", "note", "created_at"],
  };
  const eligible = w.bookings.filter(
    (b: any) => b.status === "COMPLETED" && b.delivered_at && !b.payout_id,
  );
  return (
    <DashboardShell role="ADMIN" tab={tab}>
      {tab === "notifications" ? (
        <Notifications />
      ) : (
        <>
          <div className="section-head">
            <div>
              <h1 className="page-title">
                {tab === "overview"
                  ? "A clear view of every story."
                  : label(tab)}
              </h1>
              <p className="muted">
                Approve thoughtfully. Keep the marketplace moving.
              </p>
            </div>
            {["cities", "coupons"].includes(tab) && (
              <button
                className="button"
                onClick={() => setModal({ type: tab })}
              >
                Add {tab === "cities" ? "city" : "coupon"} +
              </button>
            )}
          </div>
          {tab === "overview" || tab === "reports" ? (
            <>
              <Stats
                items={[
                  [
                    "Customers",
                    w.users.filter((u: any) => u.role === "USER").length,
                  ],
                  [
                    "Approved photographers",
                    w.photographers.filter(
                      (p: any) => p.verification === "APPROVED",
                    ).length,
                  ],
                  ["Total bookings", w.bookings.length],
                  [
                    "Captured, not refunded",
                    money(
                      w.payments
                        .filter((p: any) => p.status === "SUCCESS")
                        .reduce((s: number, p: any) => s + p.amount, 0),
                    ),
                  ],
                ]}
              />
              <div className="info-grid">
                <div className="panel">
                  <h3>Needs attention</h3>
                  <p>
                    {
                      w.photographers.filter(
                        (p: any) => p.verification === "PENDING",
                      ).length
                    }{" "}
                    photographer profiles pending
                  </p>
                  <p>
                    {w.packages.filter((p: any) => !p.approved).length} packages
                    awaiting approval
                  </p>
                  <p>
                    {
                      w.bookings.filter(
                        (b: any) =>
                          [
                            "REJECTED",
                            "CANCELLED_BY_USER",
                            "CANCELLED_BY_PHOTOGRAPHER",
                            "REFUND_REQUESTED",
                          ].includes(b.status) &&
                          b.payment_status === "SUCCESS",
                      ).length
                    }{" "}
                    paid bookings need refund review
                  </p>
                  <Link className="text-link" to="/admin/photographers">
                    Review profiles <Icon />
                  </Link>
                </div>
                <div className="panel">
                  <h3>Commission & payouts</h3>
                  <p>
                    Earned commission on completed shoots:{" "}
                    <strong>
                      {money(
                        w.bookings
                          .filter((b: any) => b.status === "COMPLETED")
                          .reduce((s: number, b: any) => s + b.commission, 0),
                      )}
                    </strong>
                  </p>
                  <p>
                    Delivered, awaiting payout:{" "}
                    <strong>
                      {money(
                        eligible.reduce(
                          (s: number, b: any) => s + b.amount - b.commission,
                          0,
                        ),
                      )}
                    </strong>
                  </p>
                  <Link className="text-link" to="/admin/payouts">
                    Manage payouts <Icon />
                  </Link>
                </div>
              </div>
              <h2>Bookings by city</h2>
              <DataTable
                rows={w.cities.map((c: any) => ({
                  id: c.id,
                  city: c.name,
                  bookings: w.bookings.filter((b: any) => b.city_id === c.id)
                    .length,
                  completed: w.bookings.filter(
                    (b: any) => b.city_id === c.id && b.status === "COMPLETED",
                  ).length,
                }))}
                columns={["city", "bookings", "completed"]}
              />
              <p className="small-copy">
                Counts are operational totals, not audited revenue or a
                conversion funnel. Dashboard lists are limited to 500 latest
                bookings.
              </p>
            </>
          ) : tab === "bookings" ? (
            <DataTable
              rows={w.bookings}
              columns={[
                "customer",
                "photographer",
                "package_title",
                "amount",
                "status",
                "start_at",
              ]}
              actions={(r: any) => (
                <>
                  <Link to={"/admin/bookings/" + r.id} className="text-link">
                    Open
                  </Link>
                  <button
                    onClick={() =>
                      setModal({ type: "booking-status", record: r })
                    }
                  >
                    Update
                  </button>
                </>
              )}
            />
          ) : tab === "portfolio" ? (
            <div className="portfolio-grid">
              {w.portfolio.map((r: any) => (
                <article className="panel portfolio-item" key={r.id}>
                  <Photo src={r.image} caption={r.caption} />
                  <p>{r.caption}</p>
                  <Badge status={r.approved ? "APPROVED" : "PENDING"} />
                  <div className="action-row">
                    <button
                      onClick={() => act("portfolio/" + r.id + "/approve")}
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => act("portfolio/" + r.id + "/reject")}
                    >
                      Hide
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : tab === "settings" ? (
            <div className="panel">
              <Form onSubmit={async (v: any) => mutate("settings", v)}>
                <Field
                  name="commission_percent"
                  title="Commission for new bookings (%)"
                  value={
                    w.settings.find((s: any) => s.key === "commission_percent")
                      ?.value
                  }
                  type="number"
                  min={0}
                  max={50}
                />
                <Field
                  name="support_email"
                  title="Support email"
                  value={
                    w.settings.find((s: any) => s.key === "support_email")
                      ?.value
                  }
                  type="email"
                />
                <p className="small-copy">
                  Super admin only. Existing bookings retain their saved
                  commission. Provider keys belong in your server environment,
                  never this form.
                </p>
              </Form>
              <h3>Email delivery queue</h3>
              <DataTable
                rows={w.outbox}
                columns={["subject", "status", "attempts", "created_at"]}
              />
            </div>
          ) : collections[tab] ? (
            <>
              {tab === "payouts" && (
                <>
                  <h2>Ready for manual transfer</h2>
                  <p>
                    Transfer funds outside the app first. Then record the real
                    bank reference below; this action does not initiate a bank
                    payment.
                  </p>
                  <DataTable
                    rows={eligible}
                    columns={[
                      "customer",
                      "photographer",
                      "amount",
                      "commission",
                    ]}
                    actions={(r: any) => (
                      <button
                        onClick={() => setModal({ type: "payout", record: r })}
                      >
                        Record transfer
                      </button>
                    )}
                  />
                  <h2>Recorded payouts</h2>
                </>
              )}
              <DataTable
                rows={w[tab] || []}
                columns={collections[tab]}
                actions={
                  [
                    "users",
                    "photographers",
                    "cities",
                    "packages",
                    "payments",
                    "reviews",
                    "coupons",
                  ].includes(tab)
                    ? (r: any) =>
                        tab === "users" ? (
                          <>
                            <button
                              disabled={
                                r.id === user.id || r.role === "SUPER_ADMIN"
                              }
                              onClick={() =>
                                setModal({ type: "user-active", record: r })
                              }
                            >
                              {r.active ? "Deactivate" : "Activate"}
                            </button>
                            {user.role === "SUPER_ADMIN" &&
                              ["USER", "ADMIN"].includes(r.role) && (
                                <button
                                  onClick={() =>
                                    setModal({ type: "role", record: r })
                                  }
                                >
                                  Change role
                                </button>
                              )}
                          </>
                        ) : tab === "photographers" ? (
                          <>
                            <button
                              onClick={() =>
                                setModal({ type: "verification", record: r })
                              }
                            >
                              Review
                            </button>
                            <button
                              onClick={() =>
                                act("photographers/" + r.id + "/feature", {
                                  featured: !r.featured,
                                })
                              }
                            >
                              {r.featured ? "Unfeature" : "Feature"}
                            </button>
                          </>
                        ) : tab === "cities" ? (
                          <>
                            <button
                              onClick={() =>
                                setModal({ type: "cities", record: r })
                              }
                            >
                              Edit
                            </button>
                            <button
                              onClick={() =>
                                setModal({ type: "city-deactivate", record: r })
                              }
                            >
                              Deactivate
                            </button>
                          </>
                        ) : tab === "packages" ? (
                          <>
                            <button
                              onClick={() =>
                                act("packages/" + r.id + "/approve")
                              }
                            >
                              Approve
                            </button>
                            <button
                              onClick={() =>
                                act("packages/" + r.id + "/reject")
                              }
                            >
                              Hide
                            </button>
                          </>
                        ) : tab === "payments" ? (
                          <>
                            <Link
                              to={"/admin/bookings/" + r.booking_id}
                              className="text-link"
                            >
                              Booking
                            </Link>
                            {r.status === "SUCCESS" && (
                              <button
                                onClick={() =>
                                  setModal({ type: "refund", record: r })
                                }
                              >
                                Refund
                              </button>
                            )}
                          </>
                        ) : tab === "reviews" ? (
                          <button
                            onClick={() =>
                              act(
                                "reviews/" +
                                  r.id +
                                  "/" +
                                  (r.visible ? "hide" : "show"),
                              )
                            }
                          >
                            {r.visible ? "Hide" : "Show"}
                          </button>
                        ) : tab === "coupons" ? (
                          <button
                            onClick={() =>
                              act("coupons/" + r.id, { active: !r.active })
                            }
                          >
                            {r.active ? "Disable" : "Enable"}
                          </button>
                        ) : null
                    : undefined
                }
              />
              {tab === "payments" && (
                <>
                  <h2>Refund ledger</h2>
                  <DataTable
                    rows={w.refunds}
                    columns={[
                      "booking_id",
                      "amount",
                      "status",
                      "reason",
                      "created_at",
                    ]}
                  />
                </>
              )}
            </>
          ) : (
            <Empty title="Page not found" />
          )}
        </>
      )}
      {modal && (
        <Dialog title={label(modal.type)} onClose={() => setModal(null)}>
          <Form
            button={
              modal.type === "refund"
                ? "Confirm full refund"
                : "Confirm changes"
            }
            onSubmit={async (v: any) => {
              const r = modal.record;
              if (modal.type === "cities")
                await mutate(
                  "cities" + (r ? "/" + r.id : ""),
                  { ...v, active: v.active === "1" },
                  r ? "PATCH" : "POST",
                );
              if (modal.type === "coupons")
                await mutate(
                  "coupons",
                  {
                    ...v,
                    max_discount: Math.round(Number(v.max_rupees) * 100),
                    expires: v.expires + "T23:59:59+05:30",
                  },
                  "POST",
                );
              if (modal.type === "verification")
                await mutate("photographers/" + r.id + "/" + v.action);
              if (modal.type === "city-deactivate")
                await mutate("cities/" + r.id, {}, "DELETE");
              if (modal.type === "user-active")
                await mutate("users/" + r.id, { active: !r.active });
              if (modal.type === "role")
                await mutate("users/" + r.id, { role: v.role });
              if (modal.type === "booking-status")
                await mutate("bookings/" + r.id + "/status", v);
              if (modal.type === "refund")
                await mutate("payments/" + r.id + "/refund", v, "POST");
              if (modal.type === "payout")
                await mutate(
                  "payouts",
                  { booking_id: r.id, reference: v.reference },
                  "POST",
                );
            }}
          >
            {modal.type === "cities" ? (
              <>
                <Field
                  name="name"
                  title="City name"
                  value={modal.record?.name}
                />
                <Field
                  name="state"
                  title="State / region"
                  value={modal.record?.state}
                  required={false}
                />
                <Field
                  name="slug"
                  title="URL slug"
                  value={modal.record?.slug}
                  placeholder="new-delhi"
                />
                <Field
                  name="active"
                  title="Status"
                  value={String(modal.record?.active ?? 1)}
                  options={[
                    { value: "1", label: "Active" },
                    { value: "0", label: "Inactive" },
                  ]}
                />
              </>
            ) : modal.type === "coupons" ? (
              <>
                <Field name="code" title="Coupon code" />
                <div className="form-grid">
                  <Field
                    name="percent"
                    title="Discount (%)"
                    type="number"
                    min={1}
                    max={90}
                    value={10}
                  />
                  <Field
                    name="max_rupees"
                    title="Maximum discount (₹)"
                    type="number"
                    min={1}
                    value={1000}
                  />
                  <Field
                    name="usage_limit"
                    title="Usage limit"
                    type="number"
                    min={1}
                    value={100}
                  />
                  <Field name="expires" title="Expiry date (IST)" type="date" />
                </div>
              </>
            ) : modal.type === "verification" ? (
              <>
                <h3>{modal.record.name}</h3>
                <p>{modal.record.bio}</p>
                <p>
                  {modal.record.experience} years · {modal.record.languages} ·{" "}
                  {modal.record.city}
                </p>
                <p className="small-copy">
                  Inspect uploaded work, contact details and pricing before
                  approving. Demo profiles are fictional.
                </p>
                <Field
                  name="action"
                  title="Decision"
                  options={[
                    { value: "verify", label: "Approve profile" },
                    { value: "reject", label: "Reject / needs changes" },
                  ]}
                />
                <Link to="/admin/portfolio" className="text-link">
                  Open portfolio moderation →
                </Link>
              </>
            ) : modal.type === "booking-status" ? (
              <>
                <p>
                  Only valid, audited transitions are allowed. Confirmation
                  requires captured payment; completion requires the scheduled
                  shoot to have ended.
                </p>
                <Field
                  name="status"
                  title="New status"
                  options={[
                    "CONFIRMED",
                    "COMPLETED",
                    "CANCELLED_BY_PHOTOGRAPHER",
                    "REFUND_REQUESTED",
                  ]}
                />
                <Field
                  name="note"
                  title="Required audit reason"
                  type="textarea"
                />
              </>
            ) : modal.type === "refund" ? (
              <>
                <div className="notice">
                  Refund <strong>{money(modal.record.amount)}</strong> via{" "}
                  <strong>{modal.record.gateway}</strong>. Real gateway refunds
                  move money and cannot be undone.
                </div>
                <p>
                  Only cancelled, rejected or refund-requested bookings are
                  eligible. This MVP supports full refunds only.
                </p>
                <Field
                  name="reason"
                  title="Reason and policy decision"
                  type="textarea"
                />
              </>
            ) : modal.type === "payout" ? (
              <>
                <p>
                  Record the transfer of{" "}
                  {money(modal.record.amount - modal.record.commission)} after
                  you have paid the photographer outside this application.
                </p>
                <Field name="reference" title="Bank / UTR reference" />
              </>
            ) : modal.type === "role" ? (
              <>
                <p>
                  Role changes invalidate all active sessions for this user.
                </p>
                <Field
                  name="role"
                  title="Role"
                  value={modal.record.role}
                  options={["USER", "ADMIN"]}
                />
              </>
            ) : (
              <p>
                {modal.type === "city-deactivate"
                  ? "Hide this city and its photographers from public discovery? Existing bookings remain accessible."
                  : "Change access for " +
                    modal.record.name +
                    "? Existing sessions will be invalidated."}
              </p>
            )}
          </Form>
        </Dialog>
      )}
    </DashboardShell>
  );
}
function StaticPage() {
  const { config } = useContext(Ctx),
    path = location.pathname;
  const titles: any = {
    "/about": "Memories, not just photographs.",
    "/how-it-works": "A little planning. A lasting memory.",
    "/pricing": "Clear packages. Beautiful possibilities.",
    "/contact": "We’re here for your story.",
    "/faq": "A little clarity goes a long way.",
    "/terms": "Terms & booking policies",
    "/privacy": "Privacy policy",
    "/refund-policy": "Cancellations & refunds",
    "/cancellation-policy": "Cancellation policy",
    "/photographer-agreement": "Photographer agreement",
    "/customer-booking-policy": "Customer booking policy",
    "/photo-usage-policy": "Photo usage policy",
  };
  return (
    <section className="wrap section narrow">
      <div className="eyebrow">SHOOTMYTOUR · THE DETAILS</div>
      <h1 className="page-title">{titles[path] || "Page not found"}</h1>
      {path === "/faq" || path === "/how-it-works" ? (
        <FaqItems />
      ) : path === "/contact" ? (
        <>
          <p className="lede">
            For an existing booking, start with the private message thread in
            your dashboard. Platform admins can view the thread to help resolve
            an issue.
          </p>
          <div className="panel">
            <h2>Contact support</h2>
            <a className="text-link" href={"mailto:" + config?.support}>
              {config?.support}
            </a>
            <p>
              Include your booking reference and a short description of what
              happened. Never send payment credentials or passwords.
            </p>
            {config?.demo && (
              <div className="notice">
                Demo support address — configure your real support email in
                admin settings before launch.
              </div>
            )}
          </div>
        </>
      ) : path === "/pricing" ? (
        <>
          <p className="lede">
            Photographers set their own package prices. Every live package shows
            its exact price, duration, edited-photo count and delivery time.
          </p>
          <div className="panel">
            <h2>Choose your pace</h2>
            <p>Gold: a focused 1-hour shoot with 20 edited photos.</p>
            <p>Platinum: a 2-hour experience with 50 edited photos.</p>
            <p>Diamond: a 4-hour story with 70 edited photos.</p>
            <p className="small-copy">
              These are demo package examples, not a platform-wide price
              guarantee. See individual profiles for available packages.
            </p>
            <Link className="button" to="/photographers">
              Explore packages <Icon />
            </Link>
          </div>
        </>
      ) : path === "/about" ? (
        <>
          <p className="lede">
            ShootMyTour connects travellers with local photographers, so the
            person making the memories gets to be in the photographs, too.
          </p>
          <h2>A local perspective makes a difference.</h2>
          <p>
            Our marketplace brings discovery, packages, availability, booking
            and payment updates into one place. Photographers share their craft;
            travellers find a personal way to remember a place.
          </p>
          <Link className="button" to="/photographers">
            Find your photographer <Icon />
          </Link>
        </>
      ) : titles[path] ? (
        <>
          <div className="notice">
            <strong>
              Draft policy — legal and business approval required before launch.
            </strong>
            <p>
              This local build provides policy scaffolding, not final legal
              advice or an approved customer contract.
            </p>
          </div>
          {path === "/privacy" ? (
            <>
              <h2>Information this application stores</h2>
              <p>
                Account name, email, optional phone, password hash, session
                data, photographer profiles, portfolios, booking details,
                messages, payment references, reviews and operational logs are
                stored to run the service. Card information is handled by the
                payment provider, not this application.
              </p>
              <h2>Who can access it</h2>
              <p>
                Public profiles show approved photographer content. Booking data
                is available to the customer, assigned photographer and platform
                admins. Notifications may be emailed via the configured
                provider.
              </p>
              <h2>Launch decisions required</h2>
              <p>
                Publish the operator’s legal identity, privacy contact,
                retention and deletion rules, subprocessors, grievance process,
                consent language and applicable rights. Portfolio uploads
                currently use local storage; select a production storage and
                media-processing policy.
              </p>
            </>
          ) : (
            <>
              <h2>Booking and payment</h2>
              <p>
                A package and time are reserved for 10 minutes during checkout.
                Payment must be verified on the server. A booking becomes
                confirmed only after photographer acceptance. INR full payment
                is the supported launch model in this build.
              </p>
              <h2>Changes, cancellations and refunds</h2>
              <p>
                Customers can request cancellation before completion. Admins
                assess paid cancellations and rejected bookings before
                initiating a full refund. Rejected or cancelled status is not
                proof that funds have been refunded. A gateway-confirmed refund
                is shown separately in the booking.
              </p>
              <h2>Delivery and photo use</h2>
              <p>
                Deliverables and timelines are recorded in each booking.
                Photographers deliver an external HTTPS gallery link. Before
                launch, define personal and commercial usage rights, retention
                periods, portfolio permission and responsibilities for backups.
              </p>
              <h2>Decisions the operator must finalize</h2>
              <ul>
                <li>
                  Customer cancellation windows, charges, no-show and weather
                  policies.
                </li>
                <li>
                  Photographer service obligations, commission, payout and
                  dispute rules.
                </li>
                <li>
                  Legal entity, tax treatment, invoice requirements and
                  grievance contact.
                </li>
                <li>
                  Intellectual property, likeness permissions, child-photo
                  consent and photo usage rights.
                </li>
              </ul>
              <p>
                These policy drafts do not create a complete legal agreement.
              </p>
            </>
          )}
          <div className="policy-links">
            {Object.entries(titles)
              .filter(
                ([k]) =>
                  k.includes("policy") ||
                  k.includes("agreement") ||
                  k === "/terms" ||
                  k === "/privacy",
              )
              .map(([k, v]: any) => (
                <Link key={k} to={k}>
                  {v}
                </Link>
              ))}
          </div>
        </>
      ) : (
        <Link to="/" className="button">
          Return home <Icon />
        </Link>
      )}
    </section>
  );
}
function App() {
  const [route, setRoute] = useState(location.pathname + location.search),
    [user, setUser] = useState<any>(null),
    [ready, setReady] = useState(false),
    [config, setConfig] = useState<any>(null),
    [cities, setCities] = useState<any[]>([]),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0),
    [toast, setToast] = useState("");
  toastFn = setToast;
  const refresh = () => setVersion((v) => v + 1),
    refreshCities = () =>
      api("/api/cities")
        .then(setCities)
        .catch(() => {});
  useEffect(() => {
    const fn = () => setRoute(location.pathname + location.search);
    window.addEventListener("popstate", fn);
    Promise.all([api("/api/auth/me"), api("/api/config"), api("/api/cities")])
      .then(([s, c, cs]) => {
        setUser(s.user);
        csrf = s.csrf || "";
        setConfig(c);
        setCities(cs);
        setReady(true);
      })
      .catch((e) => setError(e.message));
    return () => window.removeEventListener("popstate", fn);
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    document.title =
      (location.pathname === "/"
        ? "Travel memories, beautifully captured"
        : label(location.pathname.split("/")[1])) + " | ShootMyTour";
  }, [route]);
  async function logout() {
    try {
      await api("/api/auth/logout", "POST");
      csrf = "";
      setUser(null);
      go("/");
    } catch (e: any) {
      setToast(e.message);
    }
  }
  const p = location.pathname.split("/").filter(Boolean);
  let content;
  if (!ready)
    content = error ? (
      <ErrorView error={error} retry={() => location.reload()} />
    ) : (
      <div className="wrap section">
        <Loader />
      </div>
    );
  else if (!p.length) content = <Home />;
  else if (p[0] === "photographers")
    content = p[1] ? <Profile pid={p[1]} /> : <Listing />;
  else if (p[0] === "cities") content = <Cities />;
  else if (
    [
      "login",
      "register",
      "photographer-register",
      "forgot-password",
      "reset-password",
    ].includes(p[0])
  )
    content = <AuthPage />;
  else if (p[0] === "book")
    content = (
      <Guard roles={["USER"]}>
        <BookingForm pid={p[1]} />
      </Guard>
    );
  else if (p[0] === "checkout")
    content = (
      <Guard roles={["USER"]}>
        <Checkout bid={p[1]} />
      </Guard>
    );
  else if (["dashboard", "photographer", "admin"].includes(p[0])) {
    const roles =
      p[0] === "dashboard"
        ? ["USER"]
        : p[0] === "photographer"
          ? ["PHOTOGRAPHER"]
          : ["ADMIN", "SUPER_ADMIN"];
    content = (
      <Guard roles={roles}>
        {p[1] === "bookings" && p[2] ? (
          <BookingDetail bid={p[2]} />
        ) : p[0] === "dashboard" ? (
          <CustomerDashboard />
        ) : p[0] === "photographer" ? (
          <PhotographerDashboard />
        ) : (
          <AdminDashboard />
        )}
      </Guard>
    );
  } else content = <StaticPage />;
  return (
    <Ctx.Provider
      value={{
        user,
        setUser,
        config,
        cities,
        version,
        refresh,
        refreshCities,
        logout,
      }}
    >
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Header />
      <div id="main" key={route}>
        {content}
      </div>
      <Footer />
      {toast && (
        <div className="toast" role="status">
          <Icon name="check" />
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
    </Ctx.Provider>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
