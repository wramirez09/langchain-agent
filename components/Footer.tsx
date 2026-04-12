import Link from 'next/link';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white border-t border-gray-200 py-6 px-4 mt-auto">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-gray-600">
            © {currentYear} MediAuth Pro. All rights reserved.
          </div>
          
          <div className="flex items-center gap-6 text-sm">
            <Link 
              href="/legal/terms-of-service" 
              className="text-gray-600 hover:text-blue-600 transition-colors"
              prefetch={true}
            >
              Terms of Service
            </Link>
            <Link 
              href="/legal/privacy-policy" 
              className="text-gray-600 hover:text-blue-600 transition-colors"
              prefetch={true}
            >
              Privacy Policy
            </Link>
            <a 
              href="mailto:support@mediauth.pro" 
              className="text-gray-600 hover:text-blue-600 transition-colors"
            >
              Contact
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
