import { redirect } from 'next/navigation';

export default function AccountingRoot() {
  redirect('/admin/accounting/journal');
}
