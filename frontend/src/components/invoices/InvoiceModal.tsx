import { useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, Printer } from "lucide-react";
import { downloadInvoicePdf, getInvoice } from "../../api/invoices";
import { useAppSettings } from "../../hooks/useAppSettings";
import { getErrorMessage } from "../../utils/errors";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import ReceiptView from "./ReceiptView";

interface Props {
  invoiceId: string;
  onClose: () => void;
}

// Shows a receipt, and lets you print it, download it, or print it again later (a reprint)
export default function InvoiceModal({ invoiceId, onClose }: Props) {
  const { data: invoice, isPending, isError, error, refetch } = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => getInvoice(invoiceId),
    staleTime: 60_000,
  });

  const appSettings = useAppSettings();
  const printerName = appSettings.data?.printerName;
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function handleDownload() {
    if (!invoice || downloading) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const blob = await downloadInvoicePdf(invoice.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${invoice.invoiceNo}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      setDownloadError(getErrorMessage(err));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <Modal title={invoice ? `Invoice ${invoice.invoiceNo}` : "Invoice"} onClose={onClose} busy={downloading}>
        {isPending && <p className="py-10 text-center text-sm text-gray-500">Loading invoice...</p>}

        {isError && (
          <div className="space-y-3">
            <Alert variant="error">{getErrorMessage(error)}</Alert>
            <Button onClick={() => void refetch()}>Try again</Button>
          </div>
        )}

        {invoice && (
          <div className="space-y-4">
            {downloadError && <Alert variant="error">{downloadError}</Alert>}

            <div className="flex justify-center overflow-x-auto bg-gray-50 py-4">
              <ReceiptView invoice={invoice} />
            </div>

            <p className="text-center text-xs text-gray-500">
              {printerName ? 'Choose "' + printerName + '" in the print window and set the paper size to 80 mm.' : "For a receipt printer, choose it in the print window and set the paper size to 80 mm."}
            </p>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => void handleDownload()} loading={downloading}>
                {!downloading && <Download className="h-5 w-5" />}
                Download PDF
              </Button>
              <Button onClick={() => window.print()}>
                <Printer className="h-5 w-5" />
                Print
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* A second copy that only shows when printing: the page around it is hidden by index.css */}
      {invoice &&
        createPortal(
          <div id="print-receipt">
            <ReceiptView invoice={invoice} bare />
          </div>,
          document.body
        )}
    </>
  );
}
