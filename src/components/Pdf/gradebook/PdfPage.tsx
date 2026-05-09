import React from 'react';
import { Page, StyleSheet, PageProps, Text } from '@react-pdf/renderer';

const defaultStyles = StyleSheet.create({
  page: {
    fontFamily: 'TH Sarabun PSK',
    padding: '10mm 10mm 10mm 15mm', // Reduced right/left margins for more table space
    fontSize: 11,
    backgroundColor: '#FFFFFF',
    flexDirection: 'column',
  },
});

interface PdfPageProps extends Omit<PageProps, 'style'> {
  children?: React.ReactNode;
  style?: PageProps['style'];
}

const PdfPage: React.FC<PdfPageProps> = ({ children, style, ...props }) => {
  return (
    <Page size="A4" style={[defaultStyles.page, ...(Array.isArray(style) ? style : style ? [style] : [])]} {...props}>
      <Text
        style={{
          position: 'absolute',
          top: '10mm',
          right: '10mm', // Adjusted to match new margin
          fontSize: 14,
          fontFamily: 'TH Sarabun PSK',
          fontWeight: 'bold'
        }}
        render={({ pageNumber }) => pageNumber > 1 ? `หน้า ${pageNumber - 1}` : ''}
        fixed
      />
      {children}
    </Page>
  );
};

export default PdfPage;