import re

file_path = "src/pages/AcademicDepartment/StudentBehaviorClassReportPage.tsx"
with open(file_path, "r") as f:
    content = f.read()

# 1. Insert new component right before `const StudentBehaviorClassReportPage = () => {`
component_code = """
const classReportPdfStyles = StyleSheet.create({
  page: { paddingTop: 34, paddingHorizontal: 44, paddingBottom: 26, fontFamily: "TH Sarabun PSK", fontSize: 12, color: "#000", backgroundColor: "#fff" },
  topBar: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 0.8, borderBottomColor: "#5f5f5f", paddingBottom: 2, marginBottom: 8 },
  topText: { fontSize: 12.5, fontWeight: "bold" },
  logo: { position: "absolute", top: 55, left: 48, width: 45, height: 52, objectFit: "contain" },
  titleBlock: { alignItems: "center", marginTop: 26, marginBottom: 24, lineHeight: 1.2 },
  reportTitle: { fontSize: 19, fontWeight: "bold", marginBottom: 5 },
  reportSubtitle: { fontSize: 14.5, marginBottom: 2 },
  table: { borderTopWidth: 0.9, borderLeftWidth: 0.9, borderColor: "#111" },
  row: { flexDirection: "row", minHeight: 22 },
  headerRow: { minHeight: 28, backgroundColor: "#cfcfcf" },
  cell: { borderRightWidth: 0.75, borderBottomWidth: 0.75, borderColor: "#111", justifyContent: "center", paddingHorizontal: 4, paddingVertical: 2 },
  centerCell: { alignItems: "center", textAlign: "center" },
  leftCell: { alignItems: "flex-start", textAlign: "left", paddingLeft: 6 },
  headerText: { fontSize: 13, fontWeight: "bold" },
  bodyText: { fontSize: 12, lineHeight: 1.15 },
  boldText: { fontSize: 12, fontWeight: "bold" },
});

interface ClassBehaviorReportPdfDocumentProps {
  rows: ReportRow[];
  schoolName: string;
  logoUrl?: string;
  academicYear: string;
  classLabel: string;
  startDate: string;
  endDate: string;
}

const ClassBehaviorReportPdfDocument: React.FC<ClassBehaviorReportPdfDocumentProps> = ({
  rows, schoolName, logoUrl, academicYear, classLabel, startDate, endDate,
}) => {
  const pageContentWidth = 754;
  const colIndex = 40;
  const colId = 70;
  const colClass = 60;
  const colScore1 = 70;
  const colScore2 = 70;
  const colScore3 = 70;
  const colName = pageContentWidth - colIndex - colId - colClass - colScore1 - colScore2 - colScore3;

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={classReportPdfStyles.page}>
        <View style={classReportPdfStyles.topBar} fixed>
          <Text style={classReportPdfStyles.topText}>{schoolName}</Text>
          <Text style={classReportPdfStyles.topText}>รายงานคะแนนความประพฤติรายชั้นเรียน</Text>
        </View>

        {logoUrl ? <Image src={logoUrl} style={classReportPdfStyles.logo} /> : null}

        <View style={classReportPdfStyles.titleBlock}>
          <Text style={classReportPdfStyles.reportTitle}>รายงานคะแนนความประพฤติ</Text>
          <Text style={classReportPdfStyles.reportSubtitle}>{schoolName}</Text>
          <Text style={classReportPdfStyles.reportSubtitle}>ปีการศึกษา {academicYear}     ระดับชั้น {classLabel || "ทั้งหมด"}</Text>
          <Text style={classReportPdfStyles.reportSubtitle}>ช่วงระหว่างวันที่ {formatThaiDate(`${startDate}T12:00:00`)} - {formatThaiDate(`${endDate}T12:00:00`)}</Text>
        </View>

        <View style={classReportPdfStyles.table}>
          <View style={[classReportPdfStyles.row, classReportPdfStyles.headerRow]} fixed>
            <View style={[classReportPdfStyles.cell, classReportPdfStyles.centerCell, { width: colIndex }]}><Text style={classReportPdfStyles.headerText}>ลำดับ</Text></View>
            <View style={[classReportPdfStyles.cell, classReportPdfStyles.centerCell, { width: colId }]}><Text style={classReportPdfStyles.headerText}>รหัสนักเรียน</Text></View>
            <View style={[classReportPdfStyles.cell, classReportPdfStyles.centerCell, { width: colName }]}><Text style={classReportPdfStyles.headerText}>ชื่อ-นามสกุล</Text></View>
            <View style={[classReportPdfStyles.cell, classReportPdfStyles.centerCell, { width: colClass }]}><Text style={classReportPdfStyles.headerText}>ชั้น</Text></View>
            <View style={[classReportPdfStyles.cell, classReportPdfStyles.centerCell, { width: colScore1 }]}><Text style={classReportPdfStyles.headerText}>คะแนนเพิ่ม(+)</Text></View>
            <View style={[classReportPdfStyles.cell, classReportPdfStyles.centerCell, { width: colScore2 }]}><Text style={classReportPdfStyles.headerText}>คะแนนหัก(-)</Text></View>
            <View style={[classReportPdfStyles.cell, classReportPdfStyles.centerCell, { width: colScore3 }]}><Text style={classReportPdfStyles.headerText}>คงเหลือ</Text></View>
          </View>

          {rows.length === 0 ? (
            <View style={[classReportPdfStyles.row, { minHeight: 28 }]}>
              <View style={[classReportPdfStyles.cell, classReportPdfStyles.centerCell, { width: pageContentWidth }]}>
                <Text style={classReportPdfStyles.bodyText}>ไม่พบข้อมูลตามเงื่อนไขที่เลือก</Text>
              </View>
            </View>
          ) : (
            rows.map((row, index) => (
              <View key={row.student.id || index} style={classReportPdfStyles.row} wrap={false}>
                <View style={[classReportPdfStyles.cell, classReportPdfStyles.centerCell, { width: colIndex }]}><Text style={classReportPdfStyles.bodyText}>{index + 1}</Text></View>
                <View style={[classReportPdfStyles.cell, classReportPdfStyles.centerCell, { width: colId }]}><Text style={classReportPdfStyles.bodyText}>{row.student.studentId || "-"}</Text></View>
                <View style={[classReportPdfStyles.cell, classReportPdfStyles.leftCell, { width: colName }]}><Text style={classReportPdfStyles.bodyText}>{getStudentName(row.student)}</Text></View>
                <View style={[classReportPdfStyles.cell, classReportPdfStyles.centerCell, { width: colClass }]}><Text style={classReportPdfStyles.bodyText}>{getClassLabel(row.student)}</Text></View>
                <View style={[classReportPdfStyles.cell, classReportPdfStyles.centerCell, { width: colScore1 }]}><Text style={classReportPdfStyles.bodyText}>+{row.plusScore}</Text></View>
                <View style={[classReportPdfStyles.cell, classReportPdfStyles.centerCell, { width: colScore2 }]}><Text style={classReportPdfStyles.bodyText}>{row.minusScore}</Text></View>
                <View style={[classReportPdfStyles.cell, classReportPdfStyles.centerCell, { width: colScore3 }]}><Text style={classReportPdfStyles.boldText}>{row.currentScore}</Text></View>
              </View>
            ))
          )}
        </View>
      </Page>
    </Document>
  );
};
"""

content = content.replace("const StudentBehaviorClassReportPage: React.FC = () => {", component_code + "\nconst StudentBehaviorClassReportPage: React.FC = () => {")

# 2. Add state for modal
state_code = """
  const [printingStudentId, setPrintingStudentId] = useState<string | null>(null);

  // PDF Export State
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [pdfFilterMode, setPdfFilterMode] = useState<"all" | "score" | "rank">("all");
  const [pdfScoreOp, setPdfScoreOp] = useState<">=" | "<=" | "=" | ">" | "<">(">=");
  const [pdfScoreVal, setPdfScoreVal] = useState<number>(80);
  const [pdfRankMode, setPdfRankMode] = useState<"top" | "bottom">("top");
  const [pdfRankCount, setPdfRankCount] = useState<number>(10);
  const [isGeneratingClassPdf, setIsGeneratingClassPdf] = useState(false);
"""
content = content.replace("const [printingStudentId, setPrintingStudentId] = useState<string | null>(null);", state_code)

# 3. Add handleGenerateClassPdf
generate_pdf_func = """
  const handleGenerateClassPdf = async () => {
    let finalRows = [...filteredRows];

    // Filter by score
    if (pdfFilterMode === "score") {
      finalRows = finalRows.filter((r) => {
        if (pdfScoreOp === ">=") return r.currentScore >= pdfScoreVal;
        if (pdfScoreOp === "<=") return r.currentScore <= pdfScoreVal;
        if (pdfScoreOp === "=") return r.currentScore === pdfScoreVal;
        if (pdfScoreOp === ">") return r.currentScore > pdfScoreVal;
        if (pdfScoreOp === "<") return r.currentScore < pdfScoreVal;
        return true;
      });
    }

    // Filter by rank
    if (pdfFilterMode === "rank") {
      // sort
      finalRows.sort((a, b) => {
        if (pdfRankMode === "top") return b.currentScore - a.currentScore;
        return a.currentScore - b.currentScore;
      });
      finalRows = finalRows.slice(0, pdfRankCount);
    }

    if (finalRows.length === 0) {
      Swal.fire("ไม่พบข้อมูล", "ไม่มีนักเรียนที่ตรงตามเงื่อนไขที่กำหนด", "warning");
      return;
    }

    setIsGeneratingClassPdf(true);
    try {
      let classLabel = "ทุกชั้นเรียน";
      if (selectedClassLevel) {
        classLabel = selectedRoom ? `${selectedClassLevel}/${selectedRoom}` : selectedClassLevel;
      }

      const pdfBlob = await pdf(
        <ClassBehaviorReportPdfDocument
          rows={finalRows}
          schoolName={schoolName}
          logoUrl={schoolSettings.logoUrl}
          academicYear={academicYear}
          classLabel={classLabel}
          startDate={startDate}
          endDate={endDate}
        />
      ).toBlob();
      
      let conditionText = "ทั้งหมด";
      if (pdfFilterMode === "score") conditionText = `คะแนน${pdfScoreOp}${pdfScoreVal}`;
      if (pdfFilterMode === "rank") conditionText = `${pdfRankMode}${pdfRankCount}`;

      const safeName = `สรุปความประพฤติ_${classLabel}_${conditionText}_${startDate}_${endDate}`.replace(/[\\\\/:*?"<>|]/g, "");
      saveAs(pdfBlob, `${safeName}.pdf`);
      setIsPdfModalOpen(false);
    } catch (error) {
      console.error("Error generating class PDF:", error);
      Swal.fire("สร้าง PDF ไม่สำเร็จ", "ไม่สามารถสร้างรายงานรวมได้", "error");
    } finally {
      setIsGeneratingClassPdf(false);
    }
  };
"""
content = content.replace("const printStudent = async (row: ReportRow) => {", generate_pdf_func + "\n  const printStudent = async (row: ReportRow) => {")

# 4. Add the Print button in the UI right next to Refresh
button_code = """
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsPdfModalOpen(true)}
                disabled={loadingReport || loadingStudents || reportRows.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Printer size={16} />
                พิมพ์รายงาน
              </button>
              <button
"""
content = content.replace("""            <button
              onClick={buildReport}
              disabled={loadingReport || loadingStudents}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >""", button_code + """              onClick={buildReport}
              disabled={loadingReport || loadingStudents}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              """)
content = content.replace("</button>\n          </div>", "</button>\n            </div>\n          </div>")


# 5. Add the Modal UI at the bottom
modal_code = """
      {/* PDF Export Modal */}
      {isPdfModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4 py-6 backdrop-blur-sm transition-opacity">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[#1f2024] dark:ring-1 dark:ring-white/10">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4 dark:border-white/10 dark:bg-white/5">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-white">
                <Printer size={18} className="text-sky-500" />
                ตั้งค่าการพิมพ์รายงาน
              </h2>
              <button
                onClick={() => setIsPdfModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <span className="sr-only">Close</span>
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            
            <div className="p-6">
              <div className="mb-5 space-y-3">
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5">
                  <input
                    type="radio"
                    name="pdfMode"
                    className="mt-0.5 h-4 w-4 text-sky-600 focus:ring-sky-500"
                    checked={pdfFilterMode === "all"}
                    onChange={() => setPdfFilterMode("all")}
                  />
                  <div>
                    <div className="font-bold text-slate-800 dark:text-white">พิมพ์ข้อมูลทั้งหมด</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">พิมพ์รายชื่อนักเรียนทั้งหมดตามที่ค้นหาหรือตามห้องที่เลือก</div>
                  </div>
                </label>

                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5">
                  <input
                    type="radio"
                    name="pdfMode"
                    className="mt-0.5 h-4 w-4 text-sky-600 focus:ring-sky-500"
                    checked={pdfFilterMode === "score"}
                    onChange={() => setPdfFilterMode("score")}
                  />
                  <div className="flex-1">
                    <div className="font-bold text-slate-800 dark:text-white">กำหนดช่วงคะแนน</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">กรองเฉพาะนักเรียนที่มีคะแนนตรงกับเงื่อนไข</div>
                    
                    {pdfFilterMode === "score" && (
                      <div className="mt-3 flex items-center gap-2">
                        <select
                          value={pdfScoreOp}
                          onChange={(e) => setPdfScoreOp(e.target.value as any)}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-black/20 dark:text-white"
                        >
                          <option value=">=">มากกว่าหรือเท่ากับ</option>
                          <option value="<=">น้อยกว่าหรือเท่ากับ</option>
                          <option value=">">มากกว่า</option>
                          <option value="<">น้อยกว่า</option>
                          <option value="=">เท่ากับ</option>
                        </select>
                        <input
                          type="number"
                          value={pdfScoreVal}
                          onChange={(e) => setPdfScoreVal(Number(e.target.value))}
                          className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-black/20 dark:text-white"
                        />
                      </div>
                    )}
                  </div>
                </label>

                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5">
                  <input
                    type="radio"
                    name="pdfMode"
                    className="mt-0.5 h-4 w-4 text-sky-600 focus:ring-sky-500"
                    checked={pdfFilterMode === "rank"}
                    onChange={() => setPdfFilterMode("rank")}
                  />
                  <div className="flex-1">
                    <div className="font-bold text-slate-800 dark:text-white">จัดอันดับคะแนน</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">เลือกพิมพ์เฉพาะนักเรียนที่มีคะแนนสูงสุดหรือต่ำสุด</div>
                    
                    {pdfFilterMode === "rank" && (
                      <div className="mt-3 flex items-center gap-2">
                        <select
                          value={pdfRankMode}
                          onChange={(e) => setPdfRankMode(e.target.value as any)}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-black/20 dark:text-white"
                        >
                          <option value="top">คะแนนมากที่สุด</option>
                          <option value="bottom">คะแนนน้อยที่สุด</option>
                        </select>
                        <input
                          type="number"
                          value={pdfRankCount}
                          onChange={(e) => setPdfRankCount(Number(e.target.value))}
                          className="w-16 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-black/20 dark:text-white"
                        />
                        <span className="text-sm text-slate-600 dark:text-slate-300">อันดับ</span>
                      </div>
                    )}
                  </div>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 dark:border-white/10 dark:bg-white/5">
              <button
                onClick={() => setIsPdfModalOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-white/10"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleGenerateClassPdf}
                disabled={isGeneratingClassPdf}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-sky-700 disabled:opacity-70"
              >
                {isGeneratingClassPdf ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
                {isGeneratingClassPdf ? "กำลังสร้าง..." : "ยืนยันและพิมพ์"}
              </button>
            </div>
          </div>
        </div>
      )}
"""
content = content.replace("    </MainLayout>", modal_code + "\n    </MainLayout>")

with open(file_path, "w") as f:
    f.write(content)
