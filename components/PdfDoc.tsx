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
import { logoBase64 } from "@/components/pdf/logo";

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
    color: '#238dd2',
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

// Render a string with markdown `**bold**` segments as a sequence of nested
// Text spans so the bold portions render bold and `*` markers don't leak.
const renderInlineBold = (text: string, baseStyle?: any): React.ReactNode => {
  // Strip stray markdown code backticks so codes read as plain text.
  text = text.replace(/`/g, '');
  if (!text.includes('**')) return text;
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    const m = part.match(/^\*\*([^*]+)\*\*$/);
    if (m) {
      return (
        <Text key={idx} style={[baseStyle, { fontFamily: 'Helvetica-Bold' }]}>
          {m[1]}
        </Text>
      );
    }
    return part;
  });
};

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
      // Process bold/strong text — render dedicated section-header lines styled.
      // For lines that merely contain **bold** spans (e.g. "**Treatment:** ...",
      // "**Prior Authorization Required:** ...") fall through to the
      // bullet/paragraph branches below so their inline values actually render.
      // Previously an unconditional `return` here dropped everything after the
      // bold label, wiping the Request Overview key/value block.
      if (line.includes('**')) {
        const boldMatch = line.match(/\*\*([^*]+)\*\*/g);
        if (boldMatch && boldMatch.length > 0) {
          let renderedAsHeader = false;
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
              renderedAsHeader = true;
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
              renderedAsHeader = true;
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
              renderedAsHeader = true;
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
              renderedAsHeader = true;
              return;
            }

            // Update section tracking for Summary — track only; let the line
            // render inline below so any trailing content isn't dropped.
            if (text.includes('summary report') || text.includes('summary')) {
              sectionTracker.current = 'summary';
            }
          });
          if (renderedAsHeader) return;
          // else fall through — line has inline bold but is regular content
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
        if (!cleanContent || cleanContent.length === 0) {
          return;
        }

        // Medical Necessity Zone - green text with green checkboxes
        if (sectionTracker.current === 'medical-necessity-zone') {
          renderedLines.push(
            <View key={i} style={[styles.listItem, { marginLeft: indentLevel * 10 }]}>
              <View style={styles.checkbox} />
              <Text style={[styles.listItemContent, styles.listItemGreen]}>{renderInlineBold(content, styles.listItemGreen)}</Text>
            </View>
          );
          return;
        }

        // Limitations/Exclusions - red text with red X
        if (sectionTracker.current === 'exclusions') {
          renderedLines.push(
            <View key={i} style={[styles.listItem, { marginLeft: indentLevel * 10 }]}>
              <Text style={styles.redX}>✗</Text>
              <Text style={[styles.listItemContent, styles.listItemRed]}>{renderInlineBold(content, styles.listItemRed)}</Text>
            </View>
          );
          return;
        }

        // All other sections - default rendering
        renderedLines.push(
          <View key={i} style={[styles.listItem, { marginLeft: indentLevel * 10 }]}>
            <Text style={styles.listItemBullet}>•</Text>
            <Text style={styles.listItemContent}>{renderInlineBold(content)}</Text>
          </View>
        );
        return;
      } else if (line.match(/^\d+\.\s/)) {
        // Handle numbered lists
        const [num, ...rest] = line.split('. ');
        renderedLines.push(
          <View key={i} style={styles.listItem}>
            <Text style={styles.listItemBullet}>{num}.</Text>
            <Text style={styles.listItemContent}>{renderInlineBold(rest.join('. '))}</Text>
          </View>
        );
        return;
      } else if (line.trim() === '') {
        // Add some space between paragraphs
        renderedLines.push(<Text key={i} style={{ height: 10 }}> </Text>);
        return;
      } else {
        // Regular text — render inline bold so e.g.
        // "**Prior Authorization Required:** CONDITIONAL" reads correctly.
        renderedLines.push(<Text key={i} style={styles.messageContent}>{renderInlineBold(line)}</Text>);
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
              <Text style={styles.companyName}>NoteDoctorAI</Text>
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
