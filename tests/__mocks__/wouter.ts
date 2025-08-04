/**
 * Mock implementation of wouter router for tests
 */
import React from 'react';

export const useLocation = jest.fn(() => ['/', jest.fn()]);
export const useRoute = jest.fn(() => [false, {}]);
export const useRouter = jest.fn(() => ({
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  forward: jest.fn(),
}));

export const Link = ({ href, children, className, ...props }: any) => (
  <a href={href} className={className} data-testid="wouter-link" {...props}>
    {children}
  </a>
);

export const Route = ({ path, component: Component, children, ...props }: any) => {
  if (Component) {
    return <Component {...props} />;
  }
  return typeof children === 'function' ? children(props) : children;
};

export const Router = ({ children }: any) => <div data-testid="wouter-router">{children}</div>;

export const Switch = ({ children }: any) => <div data-testid="wouter-switch">{children}</div>;

export const Redirect = ({ to, href, ...props }: any) => (
  <div data-testid="wouter-redirect" data-to={to || href} {...props} />
);

export default {
  useLocation,
  useRoute,
  useRouter,
  Link,
  Route,
  Router,
  Switch,
  Redirect,
};