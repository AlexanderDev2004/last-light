import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import Footer from '../components/Footer'
import Header from '../components/Header'

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Last Light — a Ten Candles companion',
      },
      {
        name: 'description',
        content:
          'Last Light is a quiet companion for the tabletop horror game Ten Candles: ten virtual candles, shared dice, character cards, truths, and last words.',
      },
      {
        name: 'theme-color',
        content: '#141210',
      },
      {
        property: 'og:title',
        content: 'Last Light — a Ten Candles companion',
      },
      {
        property: 'og:description',
        content:
          'Every character dies. The story is what happens before the final flame goes out.',
      },
      {
        property: 'og:type',
        content: 'website',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      {
        rel: 'icon',
        type: 'image/svg+xml',
        href: '/flame.svg',
      },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: Lost,
})

function Lost() {
  return (
    <div className="wrap px-0 pt-14 pb-20">
      <p className="label">Lost</p>
      <h1 className="ritual m-0 mt-3 max-w-[20ch] text-4xl leading-tight sm:text-5xl">
        This path leads nowhere.
      </h1>
      <p className="mt-4 max-w-[60ch] leading-8 text-[var(--text-secondary)]">
        There is no such room or page. Return to the door and begin again.
      </p>
      <a href="/" className="btn btn-quiet mt-6 inline-flex">
        Back to the door
      </a>
    </div>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="font-sans antialiased [overflow-wrap:anywhere]">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:bg-[var(--accent)] focus:px-4 focus:py-2 focus:font-bold focus:text-[var(--accent-ink)]"
        >
          Skip to content
        </a>
        <Header />
        <main id="main">{children}</main>
        <Footer />
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
