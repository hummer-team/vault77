import { useEffect, useRef, useCallback, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

interface ParseMessage {
  type: string;
  id: string;
  [key: string]: any;
}

interface ParseResponse {
  type: string;
  id?: string;
  error?: string;
  data?: ArrayBuffer;
}

export const useFileParsing = (iframeRef: React.RefObject<HTMLIFrameElement>) => {
  const messageCallbacks = useRef<Map<string, { resolve: (value: any) => void; reject: (reason?: any) => void }>>(new Map());
  const [isSandboxReady, setIsSandboxReady] = useState(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<ParseResponse>) => {
      if (iframeRef.current && event.source === iframeRef.current.contentWindow) {
        if (event.data.type === 'SANDBOX_READY') {
          setIsSandboxReady(true);
          return;
        }

        const { id, type, error, data } = event.data;
        if (id) {
          const callback = messageCallbacks.current.get(id);
          if (callback) {
            if (type === 'PARSE_SUCCESS') {
              callback.resolve(data);
            } else if (type === 'PARSE_ERROR') {
              callback.reject(new Error(error || 'Unknown parsing error'));
            }
            messageCallbacks.current.delete(id);
          }
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [iframeRef]);

  const sendMessageToSandbox = useCallback(
    <T>(message: Omit<ParseMessage, 'id'>, transferables?: Transferable[]): Promise<T> => {
      return new Promise((resolve, reject) => {
        if (!isSandboxReady) {
          return reject(new Error('Sandbox not ready for parsing.'));
        }
        if (!iframeRef.current?.contentWindow) {
          return reject(new Error('Sandbox iframe not available.'));
        }

        const id = uuidv4();
        messageCallbacks.current.set(id, { resolve, reject });
        iframeRef.current.contentWindow.postMessage({ ...message, id }, '*', transferables);
      });
    },
    [iframeRef, isSandboxReady]
  );

  const parseFileToArrow = useCallback(
    async (file: File): Promise<Uint8Array> => {
      const arrayBuffer = await file.arrayBuffer();
      const arrowBuffer = await sendMessageToSandbox<ArrayBuffer>(
        { type: 'PARSE_BUFFER_TO_ARROW', buffer: arrayBuffer, fileName: file.name },
        [arrayBuffer]
      );
      return new Uint8Array(arrowBuffer);
    },
    [sendMessageToSandbox]
  );

  return { parseFileToArrow, isSandboxReady };
};
