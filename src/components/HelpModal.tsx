import { HELP_TOPICS, type HelpTopic } from '../data/helpTopics';

interface HelpModalProps {
  topicId: string | null;
  onClose: () => void;
}

export default function HelpModal({ topicId, onClose }: HelpModalProps) {
  if (!topicId) return null;
  const topic: HelpTopic | undefined = HELP_TOPICS[topicId];
  if (!topic) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative bg-gray-900 rounded-2xl shadow-2xl border border-gray-700 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-lg font-bold text-white">{topic.title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* What Is This? */}
          <div className="bg-gray-800/50 rounded-xl p-4 space-y-2">
            <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider">What Is This?</h3>
            <p className="text-sm text-gray-300 leading-relaxed">{topic.explanation}</p>
          </div>

          {/* Real-World Example */}
          <div className="bg-gray-800/50 rounded-xl p-4 space-y-2">
            <h3 className="text-xs font-bold text-green-400 uppercase tracking-wider">Real-World Example</h3>
            <p className="text-sm text-gray-300 leading-relaxed">{topic.example}</p>
          </div>

          {/* How It Affects the Score */}
          <div className="bg-gray-800/50 rounded-xl p-4 space-y-2">
            <h3 className="text-xs font-bold text-orange-400 uppercase tracking-wider">How It Affects the Score</h3>
            <p className="text-sm text-gray-300 leading-relaxed">{topic.calcEffect}</p>
          </div>
        </div>
      </div>
    </div>
  );
}