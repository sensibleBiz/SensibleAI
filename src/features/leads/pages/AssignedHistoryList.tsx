import {  Avatar, Card } from "antd";
import dayjs from "dayjs";
import { UserOutlined, ArrowRightOutlined } from "@ant-design/icons";
import { AssignHistoryEntry } from "../types/types";
import React from "react";

interface Props {
  history: AssignHistoryEntry[];
  getUserNameById: (id: string) => string;
}

export default function AssignedHistoryList({ history, getUserNameById }: Props) {
  if (!history?.length) return <p className="text-gray-500 text-sm">No assignment history</p>;

  return (
    <Card title="Assignment History" size="small" style={{ borderRadius: 8 }}>
      <div className="flex items-center gap-3 overflow-x-auto pb-2">
        {history
          .slice()
          // .reverse()
          .map((entry, index) => (
            <React.Fragment key={index}>
              <div className="flex-shrink-0 flex items-center gap-2 bg-blue-50 rounded-lg px-4 py-2 border border-blue-200">
                <Avatar size={28} icon={<UserOutlined />} />
                <div>
                  <p className="font-medium text-sm text-gray-800">
                    {getUserNameById(entry?.assignTo)}
                  </p>
                  <p className="font-medium text-sm text-gray-800">
                    Assign By:{getUserNameById(entry?.assignBy)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {dayjs(entry?.assignAt).format("DD MMM • hh:mm A")}
                  </p>
                </div>
              </div>
              
              {index < history.length - 1 && (
                <ArrowRightOutlined className="text-gray-400 flex-shrink-0" />
              )}
            </React.Fragment>
          ))}
      </div>
    </Card>
  );
}

// export default function AssignedHistoryList({ history, getUserNameById }: Props) {
//   if (!history?.length) return <p className="text-gray-500 text-sm">No assignment history</p>;

//   return (
//     <Card title="Assignment History" size="small" style={{ borderRadius: 8 }}>
//       <Timeline
//         items={history
//           .slice()                                // Copy array
//           .reverse()                              // Latest first
//           .map((entry) => ({
//             color: "blue",
//             children: (
//               <div className="p-2">
//                 <div className="flex items-center gap-3 mb-1">
//                   <Avatar size={32} icon={<UserOutlined />} />
//                   <div>
//                     <p className="font-semibold text-gray-800">
//                       Assigned to{" "}
//                       <Tag color="blue">
//                         {getUserNameById(entry?.assignTo)}
//                       </Tag>
//                     </p>
//                     <p className="text-xs text-gray-500">
//                       Assigned by {getUserNameById(entry?.assignBy)}
//                     </p>
//                   </div>
//                 </div>

//                 <p className="text-xs text-gray-600">
//                   <ArrowRightOutlined className="mr-1" />
//                   {dayjs(entry?.assignAt).format("DD MMM YYYY • hh:mm A")}
//                 </p>
//               </div>
//             ),
//           }))}
//       />
//     </Card>
//   );
// }
