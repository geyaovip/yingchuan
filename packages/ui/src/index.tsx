import {
  type FormEvent,
  type PropsWithChildren,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  Ban,
  Bell,
  Bot,
  BrainCircuit,
  Building2,
  ChartNoAxesCombined,
  ChevronUp,
  Circle,
  CircleAlert,
  CircleCheck,
  FolderKanban,
  Info,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Menu,
  RefreshCcw,
  ScrollText,
  Settings,
  UserRound,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";

export type NavigationIconName =
  | "agent"
  | "audit"
  | "dashboard"
  | "models"
  | "notifications"
  | "projects"
  | "settings"
  | "tasks"
  | "team"
  | "usage"
  | "workspaces";

export interface NavigationItem {
  readonly badge?: string;
  readonly href: string;
  readonly icon?: NavigationIconName;
  readonly label: string;
}

const navigationIcons: Record<NavigationIconName, LucideIcon> = {
  agent: Bot,
  audit: ScrollText,
  dashboard: LayoutDashboard,
  models: BrainCircuit,
  notifications: Bell,
  projects: FolderKanban,
  settings: Settings,
  tasks: ListTodo,
  team: UsersRound,
  usage: ChartNoAxesCombined,
  workspaces: Building2,
};

export interface WorkspaceOption {
  readonly id: string;
  readonly name: string;
}

export interface AppShellProps extends PropsWithChildren {
  readonly accountHref?: string;
  readonly activeHref: string;
  readonly brand?: string;
  readonly brandHref?: string;
  readonly navigation: readonly NavigationItem[];
  readonly onLogout?: () => void;
  readonly projectNavigation?: readonly NavigationItem[];
  readonly projectTitle?: string;
  readonly userEmail?: string;
  readonly workspaceId?: string;
  readonly workspaces?: readonly WorkspaceOption[];
  readonly onWorkspaceChange?: (workspaceId: string) => void;
}

export function AppShell({
  accountHref,
  activeHref,
  brand = "映川",
  brandHref,
  children,
  navigation,
  onLogout,
  onWorkspaceChange,
  projectNavigation = [],
  projectTitle,
  userEmail,
  workspaceId,
  workspaces = [],
}: AppShellProps) {
  const resolvedBrandHref = brandHref ?? navigation[0]?.href ?? "/dashboard";
  const [accountOpen, setAccountOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const accountTriggerRef = useRef<HTMLButtonElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!accountOpen) return;
    accountMenuRef.current
      ?.querySelector<HTMLElement>("a[href], button:not([disabled])")
      ?.focus();

    const close = (restoreFocus = false) => {
      setAccountOpen(false);
      if (restoreFocus) accountTriggerRef.current?.focus();
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        !event.target.closest("[data-yc-account-menu]")
      )
        close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close(true);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountOpen]);

  useEffect(() => {
    if (!menuOpen) return;

    const menuButton = menuButtonRef.current;
    const sidebar = sidebarRef.current;
    const focusableSelector =
      'a[href], button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusable = () =>
      Array.from(
        sidebar?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
      ).filter((element) => !element.hasAttribute("hidden"));

    focusable()[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      const elements = focusable();
      const first = elements[0];
      const last = elements.at(-1);
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      menuButton?.focus();
    };
  }, [menuOpen]);

  return (
    <div className="yc-app-shell">
      <a className="yc-skip-link" href="#main-content">
        跳到主要内容
      </a>
      <header className="yc-mobile-header">
        <button
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "关闭导航" : "打开导航"}
          className="yc-icon-button"
          onClick={() => setMenuOpen((open) => !open)}
          ref={menuButtonRef}
          type="button"
        >
          {menuOpen ? (
            <X aria-hidden="true" size={21} strokeWidth={1.8} />
          ) : (
            <Menu aria-hidden="true" size={21} strokeWidth={1.8} />
          )}
        </button>
        <a className="yc-brand yc-brand--mobile" href={resolvedBrandHref}>
          <span className="yc-brand__mark">映</span>
          {brand}
        </a>
        <button
          aria-expanded={accountOpen}
          aria-haspopup="menu"
          aria-label="打开账号菜单"
          className="yc-mobile-account-trigger"
          data-yc-account-menu
          onClick={(event) => {
            accountTriggerRef.current = event.currentTarget;
            setAccountOpen((open) => !open);
          }}
          type="button"
        >
          <span className="yc-avatar" aria-hidden="true">
            {userEmail?.slice(0, 1).toUpperCase() ?? "用"}
          </span>
        </button>
      </header>
      {accountOpen && (
        <AccountMenu
          accountHref={accountHref}
          menuRef={accountMenuRef}
          onLogout={onLogout}
        />
      )}
      {menuOpen && (
        <button
          aria-label="关闭导航遮罩"
          className="yc-nav-scrim"
          onClick={() => setMenuOpen(false)}
          type="button"
        />
      )}
      <aside
        aria-label="应用导航"
        className={`yc-sidebar${menuOpen ? " is-open" : ""}`}
        ref={sidebarRef}
      >
        <a className="yc-brand" href={resolvedBrandHref}>
          <span className="yc-brand__mark">映</span>
          {brand}
        </a>
        {workspaces.length > 0 && (
          <label className="yc-workspace-picker">
            <span>当前工作区</span>
            <select
              aria-label="切换工作区"
              onChange={(event) => onWorkspaceChange?.(event.target.value)}
              value={workspaceId}
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <Navigation
          activeHref={activeHref}
          items={navigation}
          onNavigate={() => setMenuOpen(false)}
        />
        <div className="yc-sidebar__account" data-yc-account-menu>
          <button
            aria-expanded={accountOpen}
            aria-haspopup="menu"
            className="yc-account-trigger"
            onClick={(event) => {
              accountTriggerRef.current = event.currentTarget;
              setAccountOpen((open) => !open);
            }}
            type="button"
          >
            <span className="yc-avatar" aria-hidden="true">
              {userEmail?.slice(0, 1).toUpperCase() ?? "用"}
            </span>
            <span className="yc-sidebar__identity">
              <strong>{userEmail ? "已登录" : "访客"}</strong>
              <small>{userEmail ?? "请登录以继续"}</small>
            </span>
            <ChevronUp
              aria-hidden="true"
              className="yc-account-trigger__chevron"
              size={15}
              strokeWidth={1.8}
            />
          </button>
        </div>
      </aside>
      <div className="yc-app-shell__body">
        {projectNavigation.length > 0 && (
          <nav aria-label="项目导航" className="yc-project-nav">
            {projectTitle && <strong>{projectTitle}</strong>}
            <div>
              {projectNavigation.map((item) => (
                <a
                  aria-current={activeHref === item.href ? "page" : undefined}
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </a>
              ))}
            </div>
          </nav>
        )}
        <main className="yc-main" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}

function AccountMenu({
  accountHref,
  menuRef,
  onLogout,
}: {
  readonly accountHref?: string;
  readonly menuRef: React.RefObject<HTMLDivElement | null>;
  readonly onLogout?: () => void;
}) {
  return (
    <div
      aria-label="账号菜单"
      className="yc-account-menu"
      data-yc-account-menu
      ref={menuRef}
      role="menu"
    >
      {accountHref && (
        <a href={accountHref} role="menuitem">
          <UserRound aria-hidden="true" size={16} strokeWidth={1.8} />
          账号设置
        </a>
      )}
      {onLogout && (
        <button onClick={onLogout} role="menuitem" type="button">
          <LogOut aria-hidden="true" size={16} strokeWidth={1.8} />
          退出登录
        </button>
      )}
    </div>
  );
}

function Navigation({
  activeHref,
  items,
  onNavigate,
}: {
  readonly activeHref: string;
  readonly items: readonly NavigationItem[];
  readonly onNavigate: () => void;
}) {
  return (
    <nav aria-label="主导航" className="yc-main-nav">
      {items.map((item) => (
        <NavigationLink
          active={activeHref === item.href}
          item={item}
          key={item.href}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );
}

function NavigationLink({
  active,
  item,
  onNavigate,
}: {
  readonly active: boolean;
  readonly item: NavigationItem;
  readonly onNavigate: () => void;
}) {
  const Icon = item.icon ? navigationIcons[item.icon] : Circle;
  return (
    <a
      aria-current={active ? "page" : undefined}
      href={item.href}
      onClick={onNavigate}
    >
      <span className="yc-main-nav__marker" aria-hidden="true">
        <Icon size={17} strokeWidth={1.8} />
      </span>
      <span>{item.label}</span>
      {item.badge && <small>{item.badge}</small>}
    </a>
  );
}

export interface PageHeaderProps {
  readonly actions?: ReactNode;
  readonly description?: string;
  readonly eyebrow?: string;
  readonly metadata?: string;
  readonly title: string;
}

export function PageHeader({
  actions,
  description,
  eyebrow,
  metadata,
  title,
}: PageHeaderProps) {
  return (
    <header className="yc-page-header">
      <div>
        {eyebrow && <p className="yc-eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && (
          <p className="yc-page-header__description">{description}</p>
        )}
        {metadata && <p className="yc-meta">{metadata}</p>}
      </div>
      {actions && <div className="yc-page-header__actions">{actions}</div>}
    </header>
  );
}

export function Button({
  children,
  intent = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly intent?: "primary" | "secondary" | "danger" | "ghost";
}) {
  return (
    <button className={`yc-button yc-button--${intent}`} {...props}>
      {children}
    </button>
  );
}

export function FormField({
  children,
  error,
  hint,
  label,
}: PropsWithChildren<{
  readonly error?: string;
  readonly hint?: string;
  readonly label: string;
}>) {
  return (
    <label className="yc-form-field">
      <span>{label}</span>
      {children}
      {hint && !error && <small>{hint}</small>}
      {error && <small className="yc-form-field__error">{error}</small>}
    </label>
  );
}

export function LoginPanel({
  audience = "user",
  busy,
  error,
  onRequestCode,
  onVerifyCode,
}: {
  readonly audience?: "user" | "admin";
  readonly busy?: boolean;
  readonly error?: string;
  readonly onRequestCode: (email: string) => Promise<boolean>;
  readonly onVerifyCode: (email: string, code: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeRequested, setCodeRequested] = useState(false);
  const emailId = useId();
  const codeId = useId();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!codeRequested) {
      if (await onRequestCode(email)) setCodeRequested(true);
      return;
    }
    await onVerifyCode(email, code);
  };
  return (
    <main className="yc-auth-page">
      <section className="yc-auth-card" aria-labelledby="login-heading">
        <a className="yc-brand yc-brand--auth" href="/">
          <span className="yc-brand__mark">映</span>
          映川
        </a>
        <p className="yc-eyebrow">
          {audience === "admin" ? "管理控制台" : "品牌内容分析"}
        </p>
        <h1 id="login-heading">{codeRequested ? "输入验证码" : "登录映川"}</h1>
        <p className="yc-auth-card__intro">
          {codeRequested
            ? `验证码已发送至 ${email}，10 分钟内有效。`
            : "使用邮箱验证码安全登录，无需记住密码。"}
        </p>
        <form onSubmit={(event) => void submit(event)}>
          <FormField label="邮箱地址">
            <input
              autoComplete="email"
              disabled={busy || codeRequested}
              id={emailId}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              required
              type="email"
              value={email}
            />
          </FormField>
          {codeRequested && (
            <FormField label="6 位验证码">
              <input
                autoComplete="one-time-code"
                id={codeId}
                inputMode="numeric"
                maxLength={6}
                minLength={6}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, ""))
                }
                pattern="[0-9]{6}"
                required
                value={code}
              />
            </FormField>
          )}
          {error && (
            <p className="yc-inline-error" role="alert">
              {error}
            </p>
          )}
          <Button disabled={busy} type="submit">
            {busy ? "正在处理…" : codeRequested ? "验证并登录" : "发送验证码"}
          </Button>
          {codeRequested && (
            <Button
              disabled={busy}
              intent="ghost"
              onClick={() => {
                setCodeRequested(false);
                setCode("");
              }}
              type="button"
            >
              更换邮箱
            </Button>
          )}
        </form>
        <p className="yc-meta">
          如果地址可用，我们会发送验证码；提示不会暴露账号状态。
        </p>
      </section>
    </main>
  );
}

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

export function StatusBadge({
  children,
  tone = "neutral",
}: PropsWithChildren<{ readonly tone?: StatusTone }>) {
  const Icon = {
    danger: CircleAlert,
    info: Info,
    neutral: Circle,
    success: CircleCheck,
    warning: CircleAlert,
  }[tone];
  return (
    <span className={`yc-status yc-status--${tone}`}>
      <Icon aria-hidden="true" size={13} strokeWidth={2} />
      {children}
    </span>
  );
}

export function MetricCard({
  confidence,
  label,
  note,
  sample,
  value,
}: {
  readonly confidence?: string;
  readonly label: string;
  readonly note?: string;
  readonly sample?: string;
  readonly value: string;
}) {
  return (
    <article className="yc-card yc-metric-card">
      <p>{label}</p>
      <strong>{value}</strong>
      {note && <span>{note}</span>}
      <footer>
        {sample && <small>{sample}</small>}
        {confidence && <small>{confidence}</small>}
      </footer>
    </article>
  );
}

export function StatePanel({
  action,
  description,
  tone = "empty",
  title,
}: {
  readonly action?: ReactNode;
  readonly description: string;
  readonly tone?: "empty" | "error" | "stale" | "forbidden";
  readonly title: string;
}) {
  const Icon = {
    empty: undefined,
    error: CircleAlert,
    forbidden: Ban,
    stale: RefreshCcw,
  }[tone];
  return (
    <section
      className={`yc-state yc-state--${tone}${Icon ? "" : " yc-state--without-icon"}`}
    >
      {Icon && (
        <span aria-hidden="true">
          <Icon size={17} strokeWidth={1.9} />
        </span>
      )}
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
        {action}
      </div>
    </section>
  );
}

export interface ResponsiveColumn<T> {
  readonly key: string;
  readonly label: string;
  readonly render: (row: T) => ReactNode;
  readonly secondary?: boolean;
}

export function ResponsiveData<T extends { readonly id: string }>({
  columns,
  emptyMessage = "暂无数据",
  rows,
}: {
  readonly columns: readonly ResponsiveColumn<T>[];
  readonly emptyMessage?: string;
  readonly rows: readonly T[];
}) {
  return (
    <div className="yc-responsive-data">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                className={column.secondary ? "yc-secondary-column" : undefined}
                key={column.key}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr className="yc-responsive-data__empty">
              <td colSpan={columns.length}>{emptyMessage}</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                {columns.map((column) => (
                  <td
                    className={
                      column.secondary ? "yc-secondary-column" : undefined
                    }
                    data-label={column.label}
                    key={column.key}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Skeleton({ lines = 3 }: { readonly lines?: number }) {
  return (
    <div aria-busy="true" aria-label="正在加载" className="yc-skeleton">
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}
