import { StyleSheet } from '@react-pdf/renderer';

export const BORDER_COLOR = '#374151'; // gray-700
export const HEADER_BG_COLOR = '#f3f4f6'; // gray-100

export const pdfStyles = StyleSheet.create({
  page: {
    fontFamily: 'TH Sarabun PSK',
    fontSize: 11,
    padding: '15mm',
    backgroundColor: 'white',
  },
  landscapePage: {
    fontFamily: 'TH Sarabun PSK',
    fontSize: 9,
    padding: '12mm',
    backgroundColor: 'white',
  },
  pageNumber: {
    position: 'absolute',
    fontSize: 9,
    bottom: '10mm',
    left: 0,
    right: '10mm',
    textAlign: 'right',
    color: 'grey',
  },
  headerContainer: {
    textAlign: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  table: {
    width: 'auto',
    borderStyle: 'solid',
    borderColor: BORDER_COLOR,
    borderWidth: 1,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  tableRow: {
    margin: 'auto',
    flexDirection: 'row',
  },
  tableHeader: {
    backgroundColor: HEADER_BG_COLOR,
    fontWeight: 'bold',
  },
  tableCell: {
    margin: 'auto',
    padding: 4,
    borderStyle: 'solid',
    borderColor: BORDER_COLOR,
    borderWidth: 1,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    textAlign: 'center',
    justifyContent: 'center',
    flexGrow: 1,
  },
  tableCellLeft: {
    textAlign: 'left',
    paddingLeft: 4,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  verticalTextContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  verticalText: {
    transform: 'rotate(-90deg)',
  },
  bold: {
    fontWeight: 'bold',
  },
});