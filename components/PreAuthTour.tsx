"use client";

import { TourProvider, useTour } from "@reactour/tour";
import * as React from "react";

const preAuthSteps = [
  {
    id: 'welcome-step',
    selector: '#welcome-header-title',
    content: 'Welcome to NoteDoctor.ai! Let us guide you through the platform features that will help you streamline your prior authorization process.',
    position: 'bottom' as const
  },

  // {
  //   id: 'logout-step',
  //   selector: '#logout-button',
  //   content: 'Use this button to securely log out of your account when you\'re done.',
  //   position: 'bottom' as const
  // },
  
  {
    id: 'pre-auth-step',
    selector: '#pre-auth-button',
    content: 'Click this button to open Pre-Authorization form. Fill out patient and procedure details to start a prior authorization request.',
    position: 'bottom' as const, 
    actionAfter: () => {
      const element = document.querySelector('#pre-auth-button');
      if (element) (element as HTMLElement).click();
      
    }
    
  },
  
  {
    id: "form-open",
    selector: "#main-form",
    highlightedSelectors: ['#main-form'],
    content: "This is the Pre-Authorization form. Fill out patient and procedure details to start a prior authorization request.",
    position: "center" as const
  },
  {
    id: 'upload-file-step',
    selector: '#upload-file-button',
    highlightedSelectors: ['#upload-file-button'],
    content: 'Upload PDF documents here for analysis. Our AI will extract relevant information and generate queries automatically.',
    position: 'bottom' as const,
    actionAfter: () => {
      const element = document.querySelector('#upload-file-button');
      if (element) (element as HTMLElement).click();
    }
  },
  {
    id: 'upload-file-step-modal',
    selector: '#upload-file-form',
    highlightedSelectors: ['#upload-file-form'],
    content: 'This is the document upload form. Choose PDF files to analyze their contents.',
    position: 'center' as const
  },
  {
    id: 'file-export-step',
    selector: '#file-export-button',
    content: 'Export your entire conversation as a PDF document for record-keeping or sharing with colleagues.',
    position: 'bottom' as const
  },

  {
    id: 'chat-input-step',
    selector: '#chat-input-field',
    content: 'Type your questions or requests here. You can ask about medical policies, prior authorizations, or upload documents for analysis.',
    position: 'top' as const
  },
  {
    id: 'send-button-step',
    selector: '#send-button',
    content: 'Click here or press Enter to send your message to our AI assistant for processing.',
    position: 'left' as const
  },
  {
    id: 'getting-started-step',
    selector: 'body',
    content: 'You\'re all set! Start by asking a question, uploading a document, or filling out pre-authorization form. Our AI is here to help!',
    position: 'center' as const
  }
];

interface PreAuthTourProps {
  children: React.ReactNode;
}

function TourManager({ children }: PreAuthTourProps) {
  const { setIsOpen, setCurrentStep } = useTour();

  React.useEffect(() => {
    // Check if tour has been displayed at least once
    const tourDisplayedOnce = localStorage.getItem('preauth-tour-displayed-once');
    const tourCompleted = localStorage.getItem('preauth-tour-completed');
    const tourDismissed = localStorage.getItem('preauth-tour-dismissed');
    
    // Only auto-start tour if it has never been displayed before
    if (!tourDisplayedOnce && !tourCompleted && !tourDismissed) {
      // Show tour after a longer delay and ensure page is fully loaded
      const timer = setTimeout(() => {
        console.log('Starting tour for first time...');
        setIsOpen(true);
        setCurrentStep(0);
        // Mark that tour has been displayed once
        localStorage.setItem('preauth-tour-displayed-once', 'true');
      }, 4000); // Increased delay to ensure all elements and modals are loaded
      
      return () => clearTimeout(timer);
    }
  }, [setIsOpen, setCurrentStep]);

  const handleTourClose = React.useCallback(() => {
    console.log('Tour closed');
    localStorage.setItem('preauth-tour-dismissed', 'true');
    setIsOpen(false);
  }, [setIsOpen]);

  // Handle window resize to ensure proper highlighting
  React.useEffect(() => {
    let resizeTimeout: NodeJS.Timeout;
    
    const handleResize = () => {
      // Clear existing timeout
      if (resizeTimeout) clearTimeout(resizeTimeout);
      
      // Wait for resize to complete before re-evaluating tour
      resizeTimeout = setTimeout(() => {
        // Force tour to re-evaluate positions after resize
        const tourElement = document.querySelector('[data-tour="true"]');
        if (tourElement) {
          // Trigger a reflow to update highlights
          tourElement.setAttribute('data-tour-refresh', Date.now().toString());
        }
      }, 300);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeTimeout) clearTimeout(resizeTimeout);
    };
  }, []);

  React.useEffect(() => {
    // Listen for tour completion
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleTourClose();
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [handleTourClose]);

  return <>{children}</>;
}

export function PreAuthTour({ children }: PreAuthTourProps) {
  return (
    <TourProvider 
      steps={preAuthSteps}
      styles={{
        popover: (base) => ({
          ...base,
          borderRadius: '8px',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
        }),
        maskArea: (base) => ({
          ...base,
          rx: 4,
        }),
      }}
    >
      <TourManager>{children}</TourManager>
    </TourProvider>
  );
}

// Hook to manually control tour
export function usePreAuthTour() {
  const { setIsOpen, setCurrentStep, steps } = useTour();
  
  const startTour = React.useCallback(() => {
    // Reset all tour state flags when manually starting
    localStorage.removeItem('preauth-tour-completed');
    localStorage.removeItem('preauth-tour-dismissed');
    localStorage.removeItem('preauth-tour-displayed-once');
    setIsOpen(true);
    setCurrentStep(0);
  }, [setIsOpen, setCurrentStep]);
  
  const resetTour = React.useCallback(() => {
    localStorage.removeItem('preauth-tour-completed');
    localStorage.removeItem('preauth-tour-dismissed');
    localStorage.removeItem('preauth-tour-displayed-once');
  }, []);
  
  return {
    startTour,
    resetTour,
    totalSteps: steps.length
  };
}
