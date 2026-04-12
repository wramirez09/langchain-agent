import Link from 'next/link';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white border-t border-gray-200 py-6 px-4 mt-auto">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs sm:text-sm text-gray-600">
            © {currentYear} NoteDoctor.Ai. All rights reserved.
          </div>
          
          <div className="flex items-center gap-6 text-xs sm:text-sm">
            <Link 
              href="/legal/terms-of-service" 
              className="text-blue-600 underline hover:text-blue-900 transition-colors underline-offset-2"
              prefetch={true}
            >
              Terms of Service
            </Link>
            <Link 
              href="/legal/privacy-policy" 
              className="text-blue-600 underline hover:text-blue-900 transition-colors underline-offset-2"
              prefetch={true}
            >
              Privacy Policy
            </Link>
            <a 
              href="mailto:support@mediauth.pro" 
              className="text-blue-600 underline hover:text-blue-900 transition-colors underline-offset-2"
            >
              Contact
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
