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
    fontWeight: 'bold',
    color: "#1e7dbf"
  },
  listItemContent: {
    flex: 1,
    fontSize: 11,
    fontWeight: 'bold',
    color: '#1e7dbf'
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
          <Text style={styles.companyName}>NoteDoctor.Ai</Text>
        </View>
      </View>

      {/* Messages */}
      {messages.map((message, index) => (
        <View key={index} style={styles.messageContainer}>
          <View style={styles.messageContent}>
            {message.content.split('\n').map((line, i) => {
              const specialHeaders = [
                'Medical Necessity Criteria:',
                'Relevant Codes:',
                'Required Documentation:',
                'Limitations/Exclusions:'
              ];
              const isSpecialHeader = specialHeaders.some(header => line.trim() === header);

              // Handle markdown headers and lists
              if (isSpecialHeader) {
                return <Text key={i} style={[styles.heading4, { color: 'red' }]}>{line}</Text>;
              } else if (line.startsWith('## ')) {
                return <Text key={i} style={styles.heading2}>{line.replace('## ', '')}</Text>;
              } else if (line.startsWith('### ')) {
                return <Text key={i} style={styles.heading3}>{line.replace('### ', '')}</Text>;
              } else if (line.startsWith('# ')) {
                return <Text key={i} style={styles.heading1}>{line.replace('# ', '')}</Text>;
              } else if (line.startsWith('- ') || line.startsWith('* ')) {
                return (
                  <View key={i} style={styles.listItem}>
                    <Text style={styles.listItemContent}>{line.replace('- ', '')}</Text>
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
      ))}
    </Page>
  </Document>
);

export default PdfDocument;
