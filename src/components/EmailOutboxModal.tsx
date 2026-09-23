/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, Mail, CheckCircle2, Clock, Send, Filter, Inbox } from 'lucide-react';
import { EmailLog, User } from '../types';

interface EmailOutboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  emails: EmailLog[];
  currentUser: User | null;
}

export const EmailOutboxModal: React.FC<EmailOutboxModalProps> = ({
  isOpen,
  onClose,
  emails,
  currentUser,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedEmail, setSelectedEmail] = useState<EmailLog | null>(null);

  if (!isOpen) return null;

  // If candidate is logged in, filter to their emails. If recruiter or admin, show all company emails.
  const relevantEmails = currentUser?.role === 'candidate'
    ? emails.filter((e) => e.toEmail.toLowerCase() === currentUser.email.toLowerCase())
    : emails;

  const filteredEmails = relevantEmails.filter((e) => {
    if (selectedCategory === 'all') return true;
    return e.category === selectedCategory;
  });

  const categories = ['all', 'application_received', 'interview_scheduled', 'offer', 'hired', 'rejected', 'invitation'];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="relative bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-100 p-6 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <Inbox className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {currentUser?.role === 'candidate' ? 'My Email Notifications' : 'System Email Outbox & Logs'}
              </h3>
              <p className="text-xs text-slate-500">
                {currentUser?.role === 'candidate'
                  ? `Showing emails delivered to ${currentUser.email}`
                  : 'Automated candidate communications & recruiter invitations'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Category Filters */}
        <div className="flex items-center gap-1.5 py-3 border-b border-slate-100 overflow-x-auto">
          <span className="text-xs text-slate-400 font-medium pl-1 flex items-center gap-1">
            <Filter className="w-3 h-3" />
            Filter:
          </span>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`text-xs px-2.5 py-1 rounded-lg capitalize whitespace-nowrap transition-colors font-medium ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat.replace('_', ' ')}
            </button>
          ))}
        </div>

        {/* Content Body: Split view or list */}
        <div className="flex-1 overflow-y-auto py-3 grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Email List */}
          <div className={`${selectedEmail ? 'md:col-span-5' : 'md:col-span-12'} space-y-2 overflow-y-auto max-h-[50vh]`}>
            {filteredEmails.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-xs">
                <Mail className="w-8 h-8 mx-auto mb-2 opacity-50" />
                No emails recorded in this category.
              </div>
            ) : (
              filteredEmails.map((email) => {
                const isSelected = selectedEmail?.id === email.id;
                return (
                  <div
                    key={email.id}
                    onClick={() => setSelectedEmail(email)}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-indigo-50 border-indigo-500 shadow-2xs'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-bold text-slate-900 truncate">{email.toName}</span>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap">
                        {new Date(email.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="font-medium text-slate-700 truncate">{email.subject}</div>
                    <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-slate-100 text-[10px] text-slate-500">
                      <span className="capitalize">{email.category.replace('_', ' ')}</span>
                      <span className="text-emerald-600 flex items-center gap-1 font-medium">
                        <CheckCircle2 className="w-3 h-3" />
                        Delivered
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Email Preview Details */}
          {selectedEmail && (
            <div className="md:col-span-7 bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs flex flex-col justify-between max-h-[50vh] overflow-y-auto">
              <div>
                <div className="pb-3 border-b border-slate-200 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">From: hiring@nowsheradigital.com</span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(selectedEmail.sentAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-xs text-slate-700">
                    To: <strong>{selectedEmail.toName}</strong> &lt;{selectedEmail.toEmail}&gt;
                  </div>
                  <div className="text-xs font-semibold text-indigo-900 pt-1">
                    Subject: {selectedEmail.subject}
                  </div>
                </div>

                <div className="py-4 whitespace-pre-wrap font-sans text-slate-800 leading-relaxed">
                  {selectedEmail.body}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-400">
                <span>Category: {selectedEmail.category}</span>
                <span>ID: {selectedEmail.id}</span>
              </div>
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>{filteredEmails.length} email(s) recorded</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
