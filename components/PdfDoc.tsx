"use client";

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  PDFViewer,
} from "@react-pdf/renderer";
import { type Message } from "ai";

// Base64 encoded logo as a data URL
const logoBase64 = 'data:image/png;base64,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';
const styles = StyleSheet.create({
  document: {
    // document-level styles
  },
  page: {
    flexDirection: "column",
    padding: 30,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 20,
  },
  title: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 13,
    marginBottom: 10,
    color: "#555",
  },
  messageContainer: {
    marginBottom: 10,
    break: "auto",
  },
  messageHeader: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  userMessage: {
    color: '#1e7dbf',
  },
  aiMessage: {
    color: '#333',
  },
  messageContent: {
    fontSize: 10,
    lineHeight: 1.5,
    marginBottom: 6,
    fontFamily: 'Helvetica',
  },
  heading1: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    marginTop: 16,
    marginBottom: 12,
  },
  heading2: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    marginTop: 14,
    marginBottom: 10,
  },
  heading3: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    marginTop: 12,
    marginBottom: 8,
  },
  heading4: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginTop: 10,
    marginBottom: 6,
  },
  listItem: {
    flexDirection: 'row',
    marginBottom: 5,
    marginTop: 2,
  },
  listItemBullet: {
    width: 20,
    fontSize: 11,
  },
  listItemContent: {
    flex: 1,
    fontSize: 10,
    lineHeight: 1.4,
    fontFamily: 'Helvetica',
  },
  listItemGreen: {
    color: '#15803d',
  },
  listItemRed: {
    color: '#b91c1c',
  },
  checkbox: {
    width: 10,
    height: 10,
    border: '1.5px solid #9ca3af',
    borderRadius: 2,
    marginRight: 6,
    marginTop: 2,
    backgroundColor: '#ffffff',
  },
  redX: {
    fontSize: 11,
    color: '#b91c1c',
    fontWeight: 'bold',
    marginRight: 6,
    marginTop: 2,
  },
  sectionHeaderGreen: {
    color: '#15803d',
    fontFamily: 'Helvetica-Bold',
  },
  sectionHeaderRed: {
    color: '#b91c1c',
    fontFamily: 'Helvetica-Bold',
  },
  companyName: {
    fontSize: 16,
    fontWeight: "bold",
  },
  logo: {
    width: '25', // Adjust width as needed
    height: 'auto', // Maintain aspect ratio
    alignSelf: 'center'
  },
});

type PdfProps = {
  name: string;
  role: string;
  messages: Message[];
};

const PdfDoc: React.FC<PdfProps> = React.memo(({ name, role, messages }) => {
  // Defensive check
  if (!messages || messages.length === 0) {
    return (
      <PDFViewer width="100%" height="100%">
        <Document>
          <Page style={styles.page}>
            <Text>No messages to display</Text>
          </Page>
        </Document>
      </PDFViewer>
    );
  }

  // Helper to render a single message with section tracking
  const renderMessage = (message: Message, index: number) => {
    if (!message || !message.content) {
      return null;
    }
    // Track current section as we process lines (mimics sectionTracker from ChatMessageBubble)
    const sectionTracker = { current: null as 'medical-necessity-zone' | 'exclusions' | 'summary' | 'relevant-codes' | null };
    const lines = message.content.split('\n');
    const renderedLines: React.ReactElement[] = [];

    lines.forEach((line, i) => {
      const lineLower = line.toLowerCase();
      
      // Process bold/strong text (section headers) - matches ChatMessageBubble strong component
      if (line.includes('**')) {
        const boldMatch = line.match(/\*\*([^*]+)\*\*/g);
        if (boldMatch && boldMatch.length > 0) {
          boldMatch.forEach((bold, boldIndex) => {
            const text = bold.replace(/\*\*/g, '').toLowerCase();
            
            // Update section tracking and style Medical Necessity Criteria header in green
            if (text.includes('medical necessity criteria')) {
              sectionTracker.current = 'medical-necessity-zone';
              renderedLines.push(
                <Text key={`${i}-${boldIndex}-mednec`} style={[styles.heading4, styles.sectionHeaderGreen]}>
                  {bold.replace(/\*\*/g, '')}
                </Text>
              );
              return;
            }
            
            // Update section tracking and style Required Documentation header in green
            if (text.includes('required documentation')) {
              sectionTracker.current = 'medical-necessity-zone';
              renderedLines.push(
                <Text key={`${i}-${boldIndex}-reqdoc`} style={[styles.heading4, styles.sectionHeaderGreen]}>
                  {bold.replace(/\*\*/g, '')}
                </Text>
              );
              return;
            }
            
            // Update section tracking for Relevant Codes
            if (text.includes('relevant codes')) {
              sectionTracker.current = 'relevant-codes';
              renderedLines.push(
                <Text key={`${i}-${boldIndex}-relcodes`} style={styles.heading4}>
                  {bold.replace(/\*\*/g, '')}
                </Text>
              );
              return;
            }
            
            // Update section tracking and style Limitations and Exclusions header in red
            if (text.includes('limitations and exclusions') || (text.includes('limitations') && text.includes('exclusions'))) {
              sectionTracker.current = 'exclusions';
              renderedLines.push(
                <Text key={`${i}-${boldIndex}-excl`} style={[styles.heading4, styles.sectionHeaderRed]}>
                  {bold.replace(/\*\*/g, '')}
                </Text>
              );
              return;
            }
            
            // Update section tracking for Summary
            if (text.includes('summary report') || text.includes('summary')) {
              sectionTracker.current = 'summary';
              renderedLines.push(
                <Text key={`${i}-${boldIndex}-summary`} style={styles.heading4}>
                  {bold.replace(/\*\*/g, '')}
                </Text>
              );
              return;
            }
            
            // Render all other bold text as headers (e.g., **Determination:**, **Prior Authorization Required:**)
            renderedLines.push(
              <Text key={`${i}-${boldIndex}-bold`} style={[styles.heading4, { fontFamily: 'Helvetica-Bold' }]}>
                {bold.replace(/\*\*/g, '')}
              </Text>
            );
          });
          
          // We handled the bold text, skip further processing
          return;
        }
      }
      
      // Handle markdown headers
      if (line.startsWith('## ')) {
        renderedLines.push(<Text key={i} style={styles.heading2}>{line.replace('## ', '')}</Text>);
        return;
      } else if (line.startsWith('### ')) {
        renderedLines.push(<Text key={i} style={styles.heading3}>{line.replace('### ', '')}</Text>);
        return;
      } else if (line.startsWith('# ')) {
        renderedLines.push(<Text key={i} style={styles.heading1}>{line.replace('# ', '')}</Text>);
        return;
      } else if (line.match(/^\s*[\-\*]\s*/)) {
        // Handle bullets at any indentation level (matches ChatMessageBubble li component)
        const content = line.replace(/^\s*[\-\*]\s+/, '');
        const indentLevel = (line.match(/^\s*/)?.[0].length || 0) / 2;
        
        // Skip empty bullets or bullets with only whitespace/special chars
        const cleanContent = content.trim().replace(/[\u200B-\u200D\uFEFF]/g, ''); // Remove zero-width spaces
        
        // Debug logging for empty bullets
        if (!cleanContent || cleanContent.length === 0) {
          console.log('Skipping empty bullet:', { 
            line: JSON.stringify(line), 
            content: JSON.stringify(content),
            cleanContent: JSON.stringify(cleanContent),
            lineLength: line.length 
          });
          return;
        }
        
        // Medical Necessity Zone - green text with green checkboxes
        if (sectionTracker.current === 'medical-necessity-zone') {
          renderedLines.push(
            <View key={i} style={[styles.listItem, { marginLeft: indentLevel * 10 }]}>
              <View style={styles.checkbox} />
              <Text style={[styles.listItemContent, styles.listItemGreen]}>{content}</Text>
            </View>
          );
          return;
        }
        
        // Limitations/Exclusions - red text with red X
        if (sectionTracker.current === 'exclusions') {
          renderedLines.push(
            <View key={i} style={[styles.listItem, { marginLeft: indentLevel * 10 }]}>
              <Text style={styles.redX}>✗</Text>
              <Text style={[styles.listItemContent, styles.listItemRed]}>{content}</Text>
            </View>
          );
          return;
        }
        
        // All other sections - default rendering
        renderedLines.push(
          <View key={i} style={[styles.listItem, { marginLeft: indentLevel * 10 }]}>
            <Text style={styles.listItemContent}>{content}</Text>
          </View>
        );
        return;
      } else if (line.match(/^\d+\.\s/)) {
        // Handle numbered lists
        const [num, ...rest] = line.split('. ');
        renderedLines.push(
          <View key={i} style={styles.listItem}>
            <Text style={styles.listItemBullet}>{num}.</Text>
            <Text style={styles.listItemContent}>{rest.join('. ')}</Text>
          </View>
        );
        return;
      } else if (line.trim() === '') {
        // Add some space between paragraphs
        renderedLines.push(<Text key={i} style={{ height: 10 }}> </Text>);
        return;
      } else {
        // Regular text
        renderedLines.push(<Text key={i} style={styles.messageContent}>{line}</Text>);
      }
    });
    
    return (
      <View key={index} style={styles.messageContainer}>
        <View style={styles.messageContent}>
          {renderedLines}
        </View>
      </View>
    );
  };
  
  return (
    <PDFViewer width="100%" height="100%">
      <Document>
        <Page style={styles.page}>
          <View style={styles.header}>
            <Image src={logoBase64} style={styles.logo} cache={false} />
            <View>
              <Text style={styles.companyName}>NoteDoctor.ai</Text>
            </View>
          </View>

          {/* Messages */}
          {messages.map((message, index) => renderMessage(message, index))}
        </Page>
      </Document>
    </PDFViewer>
  );
}, (prevProps, nextProps) => {
  // Custom comparison: only re-render if messages actually changed
  if (prevProps.messages.length !== nextProps.messages.length) {
    return false; // Props changed, re-render
  }

  // Compare id AND content. During streaming, AI SDK keeps the same message
  // id while content grows; comparing by id alone froze the preview at the
  // first chunk and it never updated when the stream finished.
  for (let i = 0; i < prevProps.messages.length; i++) {
    const prev = prevProps.messages[i];
    const next = nextProps.messages[i];
    if (prev.id !== next.id) return false;
    if (prev.content !== next.content) return false;
  }

  return true; // Props same, skip re-render
});

PdfDoc.displayName = 'PdfDoc';

export default PdfDoc;
