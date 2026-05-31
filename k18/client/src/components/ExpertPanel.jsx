import React, { useState } from 'react';
import useRoomStore from '../store/roomStore';
import { User, UserX, Video, MessageSquare } from 'lucide-react';

export default function ExpertPanel() {
  const experts = useRoomStore((s) => s.experts);
  const remoteStreams = useRoomStore((s) => s.remoteStreams);
  const annotations = useRoomStore((s) => s.annotations);
  const [selectedExpert, setSelectedExpert] = useState(null);

  const getExpertAnnotationCount = (expertId) => {
    return annotations.filter((a) => a.expertId === expertId).length;
  };

  return (
    <div className="w-64 bg-gray-800 border-l border-gray-700 flex flex-col">
      <div className="p-3 border-b border-gray-700">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <User size={18} />
          会诊专家 ({experts.length})
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto">
        {experts.map((expert) => (
          <div
            key={expert.id}
            className={`p-3 border-b border-gray-700/50 hover:bg-gray-700/50 cursor-pointer transition-colors ${
              selectedExpert === expert.id ? 'bg-gray-700' : ''
            }`}
            onClick={() => setSelectedExpert(selectedExpert === expert.id ? null : expert.id)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
                  style={{ backgroundColor: expert.color || '#4ECDC4' }}
                >
                  {expert.name?.charAt(0) || '?'}
                </div>
                <div>
                  <p className="text-white text-sm font-medium">{expert.name}</p>
                  <p className="text-gray-400 text-xs">
                    {getExpertAnnotationCount(expert.id)} 个标注
                  </p>
                </div>
              </div>

              {remoteStreams.has(expert.id) && (
                <Video size={14} className="text-green-400" />
              )}
            </div>
          </div>
        ))}

        {experts.length === 0 && (
          <div className="p-4 text-center text-gray-500">
            <UserX size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">暂无专家加入</p>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-gray-700">
        <button className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded flex items-center justify-center gap-2 transition-colors">
          <MessageSquare size={16} />
          文字聊天
        </button>
      </div>
    </div>
  );
}
