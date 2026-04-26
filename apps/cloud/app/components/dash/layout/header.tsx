import { Fragment } from "react";
import { Link } from "react-router";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "~/components/ui/breadcrumb";
import { Separator } from "~/components/ui/separator";
import { SidebarTrigger } from "~/components/ui/sidebar";
import { useBreadcrumbs } from "~/hooks/use-breadcrumbs";

/**
 * Sticky header for the /dash subtree. Renders SidebarTrigger + a
 * breadcrumb chain assembled from each route's `handle.breadcrumb`.
 * Last entry renders as <BreadcrumbPage> (current page); earlier
 * entries with an `href` render as links, those without as plain text.
 */
export function DashHeader() {
  const crumbs = useBreadcrumbs();

  return (
    <header className="flex h-12 shrink-0 gap-2 border-border/60 border-b">
      <div className="flex w-full items-center px-4 sm:px-6">
        <SidebarTrigger className="-ml-1.5" />
        <Separator orientation="vertical" className="!h-4 mr-3.5 ml-2" />
        <Breadcrumb>
          <BreadcrumbList>
            {crumbs.map((crumb, i) => {
              const isLast = i === crumbs.length - 1;
              return (
                <Fragment key={crumb.href ?? `seg-${i}`}>
                  {i > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem>
                    {isLast ? (
                      <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                    ) : crumb.href ? (
                      <BreadcrumbLink asChild>
                        <Link to={crumb.href}>{crumb.label}</Link>
                      </BreadcrumbLink>
                    ) : (
                      <span className="text-muted-foreground">{crumb.label}</span>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </header>
  );
}
