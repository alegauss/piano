import { install, navLinks, parentUrl, releasesUrl, repoUrl } from '../lib/site-content'
import { asset, href } from '../lib/paths'
import { ThemeToggle } from './ui/ThemeToggle'

export function Nav() {
  return (
    <nav>
      <div className="wrap">
        <div className="nav-left">
          <a className="brand" href={href('/')}>
            <img src={asset('logo.svg')} alt="" />
            Piano
          </a>
          <a className="parent" href={parentUrl} title="alegauss: small developer tools">
            <span className="pre">part of</span>
            <b>alegauss</b>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M7 17 17 7" />
              <path d="M9 7h8v8" />
            </svg>
          </a>
        </div>
        <div className="nav-links">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
          {/* The primary button goes where a reader who has decided goes: the release when
              there is one, the install section while there is not. */}
          <a className="btn btn-primary" href={install.released ? releasesUrl : href('/#install')}>
            {install.ctaShort}
          </a>
          <a className="btn btn-ghost" href={repoUrl}>
            ★ View on GitHub
          </a>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  )
}
