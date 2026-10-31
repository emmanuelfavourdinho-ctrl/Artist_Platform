import type { ReactNode } from 'react';
import { BuyerShell } from '../../components/account/BuyerShell';

export default function AccountLayout({ children }: { children: ReactNode }) {
  return <BuyerShell>{children}</BuyerShell>;
}
