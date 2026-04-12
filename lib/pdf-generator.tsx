import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from "@react-pdf/renderer";
import { type Message } from "ai";

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
    lineHeight: 1.4,
    marginBottom: 8,
  },
  heading1: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    marginTop: 10,
    marginBottom: 10,
  },
  heading2: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    marginTop: 8,
    marginBottom: 10,
  },
  heading3: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    marginTop: 6,
    marginBottom: 10,
  },
  heading4: {
    fontSize: 11,
    fontFamily: 'Helvetica',
    marginTop: 6,
    marginBottom: 10,
  },
  listItem: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  listItemBullet: {
    width: 20,
    fontSize: 11,
  },
  listItemContent: {
    flex: 1,
    fontSize: 11,
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
    border: '1px solid #4ade80',
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
    width: '25',
    height: 'auto',
    alignSelf: 'center'
  },
});

interface PdfDocumentProps {
  name: string;
  role: string;
  messages: Message[];
  logoBase64: string;
}

const PdfDocument: React.FC<PdfDocumentProps> = ({ name, role, messages, logoBase64 }) => (
  <Document>
    <Page style={styles.page}>
      <View style={styles.header}>
        <Image src={logoBase64} style={styles.logo} cache={false} />
        <View>
          <Text style={styles.companyName}>NoteDoctor.ai</Text>
        </View>
      </View>

      {/* Messages */}
      {messages.map((message, index) => {
        // Track current section for styling
        let currentSection: 'required-documentation' | 'medical-necessity' | 'exclusions' | 'summary' | null = null;
        const lines = message.content.split('\n');
        
        return (
          <View key={index} style={styles.messageContainer}>
            <View style={styles.messageContent}>
              {lines.map((line, i) => {
                // Update section tracking
                const lineLower = line.toLowerCase();
                if (lineLower.includes('required documentation')) {
                  currentSection = 'required-documentation';
                } else if (lineLower.includes('medical necessity criteria')) {
                  currentSection = 'medical-necessity';
                } else if (lineLower.includes('limitations') || lineLower.includes('exclusions')) {
                  currentSection = 'exclusions';
                } else if (lineLower.includes('summary report') || lineLower.includes('## summary')) {
                  currentSection = 'summary';
                }

                // Detect section headers
                const isRequiredDoc = lineLower.includes('required documentation');
                const isMedicalNecessity = lineLower.includes('medical necessity criteria');
                const isExclusions = lineLower.includes('limitations') || lineLower.includes('exclusions');
                const isSectionHeader = isRequiredDoc || isMedicalNecessity || isExclusions;

                // Handle markdown headers and lists
                if (isSectionHeader && line.startsWith('**') && line.endsWith('**')) {
                  const headerStyle = (isRequiredDoc || isMedicalNecessity) ? styles.sectionHeaderGreen : styles.sectionHeaderRed;
                  return <Text key={i} style={[styles.heading4, headerStyle]}>{line.replace(/\*\*/g, '')}</Text>;
              } else if (line.startsWith('## ')) {
                return <Text key={i} style={styles.heading2}>{line.replace('## ', '')}</Text>;
              } else if (line.startsWith('### ')) {
                return <Text key={i} style={styles.heading3}>{line.replace('### ', '')}</Text>;
              } else if (line.startsWith('# ')) {
                return <Text key={i} style={styles.heading1}>{line.replace('# ', '')}</Text>;
              } else if (line.startsWith('- ') || line.startsWith('* ')) {
                const content = line.replace(/^[\-\*]\s+/, '');
                const showCheckbox = currentSection === 'required-documentation' || currentSection === 'medical-necessity';
                const isRed = currentSection === 'exclusions';
                const textStyle = showCheckbox ? styles.listItemGreen : (isRed ? styles.listItemRed : {});
                
                return (
                  <View key={i} style={styles.listItem}>
                    {showCheckbox && <View style={styles.checkbox} />}
                    <Text style={[styles.listItemContent, textStyle]}>{content}</Text>
                  </View>
                );
              } else if (line.match(/^\d+\.\s/)) {
                // Handle numbered lists
                const [num, ...rest] = line.split('. ');
                return (
                  <View key={i} style={styles.listItem}>
                    <Text style={styles.listItemBullet}>{num}.</Text>
                    <Text style={styles.listItemContent}>{rest.join('. ')}</Text>
                  </View>
                );
              } else if (line.trim() === '') {
                // Add some space between paragraphs
                return <Text key={i} style={{ height: 8 }}> </Text>;
              } else {
                // Regular text
                return <Text key={i} style={styles.messageContent}>{line}</Text>;
              }
              })}
            </View>
          </View>
        );
      })}
    </Page>
  </Document>
);

export default PdfDocument;
