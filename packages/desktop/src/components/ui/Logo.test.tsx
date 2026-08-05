import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Logo } from './Logo';

describe('Logo', () => {
  it('renders the icon with an accessible name', () => {
    render(<Logo />);

    expect(screen.getByRole('img', { name: 'Opera' })).toBeInTheDocument();
  });

  it('sizes the icon according to the size prop', () => {
    render(<Logo size={48} />);

    const icon = screen.getByRole('img', { name: 'Opera' });
    expect(icon).toHaveAttribute('width', '48');
    expect(icon).toHaveAttribute('height', '48');
  });

  it('does not render the wordmark by default', () => {
    render(<Logo />);

    expect(screen.queryByText('Opera')).not.toBeInTheDocument();
  });

  it('renders the wordmark when showWordmark is true', () => {
    render(<Logo showWordmark />);

    expect(screen.getByText('Opera')).toBeInTheDocument();
  });
});
