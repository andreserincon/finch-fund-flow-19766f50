import { useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import type { Book } from '@/lib/library-types';

interface BookQRLabelProps {
  book: Book;
}

export function BookQRLabel({ book }: BookQRLabelProps) {
  const { t } = useTranslation();
  const labelRef = useRef<HTMLDivElement>(null);

  const downloadPNG = useCallback(async () => {
    if (!labelRef.current) return;
    const dataUrl = await toPng(labelRef.current, { pixelRatio: 3 });
    const link = document.createElement('a');
    link.download = `label-${book.id.slice(0, 8)}.png`;
    link.href = dataUrl;
    link.click();
  }, [book.id]);

  const downloadPDF = useCallback(async () => {
    if (!labelRef.current) return;
    const dataUrl = await toPng(labelRef.current, { pixelRatio: 3 });
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [50, 80] });
    pdf.addImage(dataUrl, 'PNG', 0, 0, 80, 50);
    pdf.save(`label-${book.id.slice(0, 8)}.pdf`);
  }, [book.id]);

  return (
    <div className="space-y-3">
      <div
        ref={labelRef}
        className="bg-white text-black p-4 rounded border mx-auto"
        style={{ width: '302px', height: '189px' }}
      >
        <div className="flex gap-3 h-full">
          <div className="flex-shrink-0 flex items-center justify-center">
            <QRCodeSVG value={`${window.location.origin}/library?book=${book.id}`} size={100} level="M" />
          </div>
          <div className="flex-1 flex flex-col justify-between min-w-0 overflow-hidden">
            <div>
              <p className="font-bold text-xs leading-tight line-clamp-2">{book.title}</p>
              <p className="text-[10px] text-gray-600 mt-0.5 truncate">{book.author}</p>
            </div>
            <div>
              <p className="text-[8px] text-gray-400 font-mono truncate">ID: {book.id.slice(0, 8)} · #{book.copy_number || 1}</p>
              <p className="text-[8px] text-gray-500 font-semibold mt-0.5">⊞ Biblioteca de la Logia</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2 justify-center">
        <Button size="sm" variant="outline" onClick={downloadPNG}>
          <Download className="h-3 w-3 mr-1" />PNG
        </Button>
        <Button size="sm" variant="outline" onClick={downloadPDF}>
          <Download className="h-3 w-3 mr-1" />PDF
        </Button>
      </div>
    </div>
  );
}
