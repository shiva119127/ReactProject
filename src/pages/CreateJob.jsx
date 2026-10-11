import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  User,
  Briefcase,
  AlertCircle,
  HelpCircle,
  Hash,
  Mail,
  Phone,
  ShieldAlert,
  Loader2,
  Lock,
} from 'lucide-react';
import Button from '../components/ui/Button';
import SupabaseSetupBanner from '../components/ui/SupabaseSetupBanner';
import { useAuth } from '../context/useAuth';
import { createJob } from '../services/jobs';

/**
 * Returns today's local date string formatted as YYYY-MM-DD
 */
function getTodayLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function CreateJob() {
  const navigate = useNavigate();
  const { user, isConfigured } = useAuth();

  // Controlled form state
  const [formData, setFormData] = useState({
    customerName: '',
    phoneNumber: '',
    email: '',
    jobTitle: '',
    requirements: '',
    quantity: '',
    dueDate: '',
    internalNotes: '',
  });

  // Validation & submission state
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const minDate = getTodayLocalDate();

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // Clear specific field error on change
    if (errors[name]) {
      setErrors((prev) => {
        const updated = { ...prev };
        delete updated[name];
        return updated;
      });
    }

    if (submitError) {
      setSubmitError('');
    }
  };

  const validateForm = () => {
    const newErrors = {};

    // 1. Customer Name (Required)
    const trimmedCustomerName = formData.customerName.trim();
    if (!trimmedCustomerName) {
      newErrors.customerName = 'Customer name is required.';
    }

    // 2. Email Address (Optional, validate format only if provided)
    const trimmedEmail = formData.email.trim();
    if (trimmedEmail) {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(trimmedEmail)) {
        newErrors.email = 'Please enter a valid email address (e.g. customer@example.com).';
      }
    }

    // 3. Job Title (Required)
    const trimmedJobTitle = formData.jobTitle.trim();
    if (!trimmedJobTitle) {
      newErrors.jobTitle = 'Job title is required.';
    }

    // 4. Customer Requirements (Required)
    const trimmedRequirements = formData.requirements.trim();
    if (!trimmedRequirements) {
      newErrors.requirements = 'Customer requirements are required.';
    }

    // 5. Quantity (Required positive whole number >= 1)
    const trimmedQuantity = formData.quantity.trim();
    if (!trimmedQuantity) {
      newErrors.quantity = 'Quantity is required.';
    } else {
      const parsedQty = Number(trimmedQuantity);
      if (
        !/^\d+$/.test(trimmedQuantity) ||
        !Number.isInteger(parsedQty) ||
        parsedQty < 1
      ) {
        newErrors.quantity = 'Quantity must be a positive whole number (at least 1).';
      }
    }

    // 6. Due Date (Optional, not earlier than today's local date)
    const trimmedDueDate = formData.dueDate.trim();
    if (trimmedDueDate) {
      const todayStr = getTodayLocalDate();
      if (trimmedDueDate < todayStr) {
        newErrors.dueDate = 'Due date cannot be earlier than today.';
      }
    }

    return newErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');

    // Step 1: Run client-side validation
    const validationErrors = validateForm();
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      const fieldOrder = [
        'customerName',
        'phoneNumber',
        'email',
        'jobTitle',
        'requirements',
        'quantity',
        'dueDate',
        'internalNotes',
      ];
      const firstInvalidField = fieldOrder.find((field) => validationErrors[field]);
      if (firstInvalidField) {
        const el = document.getElementById(firstInvalidField);
        if (el) {
          el.focus();
        }
      }
      return;
    }

    // Step 2: Check configuration & authentication
    if (!isConfigured) {
      setSubmitError(
        'Database connection not configured. Please add your Supabase credentials to .env.'
      );
      return;
    }

    if (!user) {
      setSubmitError('Authentication required: Please sign in before creating a job.');
      return;
    }

    // Step 3: Prevent repeated submissions
    setSubmitting(true);

    try {
      // Step 4 - 9: Map fields, set owner_id, and insert to Supabase
      const newJob = await createJob(formData, user.id);

      if (!newJob || !newJob.id) {
        throw new Error('Database did not return the saved job record.');
      }

      // Step 10: Navigate to the newly created job's details page
      navigate(`/jobs/${newJob.id}`);
    } catch (err) {
      // Preserve form values, show understandable error, do not navigate
      setSubmitError(
        err.message || 'An error occurred while saving the job to the database. Please try again.'
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col gap-3 pb-4 border-b border-slate-200/80">
        <div className="flex items-center gap-2">
          <Button
            to="/jobs"
            variant="ghost"
            size="sm"
            icon={ArrowLeft}
            id="create-job-back-btn"
            className="px-2 py-1 text-slate-500 hover:text-slate-800"
          >
            Back to Jobs
          </Button>
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Create New Job
          </h1>
          <p className="mt-1.5 text-sm sm:text-base text-slate-600 leading-relaxed">
            Record customer details and capture the exact requirements for their print order.
          </p>
        </div>
      </div>

      {/* Supabase Setup Banner if environment variables are missing */}
      {!isConfigured && <SupabaseSetupBanner />}

      {/* Unauthenticated Alert */}
      {isConfigured && !user && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Lock className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-sm text-amber-800">
              You must be signed in as an authenticated shop owner to create and save jobs.
            </p>
          </div>
          <Button to="/login" variant="primary" size="sm">
            Sign In
          </Button>
        </div>
      )}

      {/* Submission Error Banner */}
      {submitError && (
        <div
          id="form-error-banner"
          role="alert"
          aria-live="assertive"
          className="rounded-xl bg-red-50 border border-red-200 p-4 sm:p-5 flex items-start gap-3 shadow-xs"
        >
          <div className="p-1 rounded-full bg-red-100 text-red-700 shrink-0 mt-0.5">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-red-900">Failed to Save Job</h2>
            <p className="mt-0.5 text-sm text-red-800 leading-relaxed">{submitError}</p>
          </div>
        </div>
      )}

      {/* Main Job Creation Form */}
      <form onSubmit={handleSubmit} noValidate className="space-y-8">
        {/* SECTION A: Customer Details */}
        <section
          aria-labelledby="section-customer-heading"
          className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 sm:p-8"
        >
          <div className="flex items-center gap-3 pb-5 border-b border-slate-100 mb-6">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="section-customer-heading"
                className="text-lg font-bold text-slate-900 tracking-tight"
              >
                Section A — Customer Details
              </h2>
              <p className="text-xs text-slate-500">
                Contact information for order communication and proof delivery.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
            {/* Customer Name */}
            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="customerName"
                  className="block text-sm font-medium text-slate-800"
                >
                  Customer Name <span className="text-red-500">*</span>
                </label>
                <span className="text-xs text-slate-400">Required</span>
              </div>
              <input
                type="text"
                id="customerName"
                name="customerName"
                value={formData.customerName}
                onChange={handleInputChange}
                autoComplete="name"
                placeholder="Enter customer's full name"
                aria-invalid={errors.customerName ? 'true' : 'false'}
                aria-describedby={errors.customerName ? 'customerName-error' : undefined}
                className={`w-full px-3.5 py-2.5 rounded-lg border text-sm text-slate-900 placeholder:text-slate-400 transition-colors bg-white focus:outline-none focus:ring-2 ${
                  errors.customerName
                    ? 'border-red-400 focus:border-red-500 focus:ring-red-200 bg-red-50/20'
                    : 'border-slate-300 focus:border-blue-500 focus:ring-blue-100 hover:border-slate-400'
                }`}
              />
              {errors.customerName && (
                <p
                  id="customerName-error"
                  role="alert"
                  className="mt-1.5 text-xs font-medium text-red-600 flex items-center gap-1.5"
                >
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errors.customerName}</span>
                </p>
              )}
            </div>

            {/* Phone Number */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="phoneNumber"
                  className="block text-sm font-medium text-slate-800"
                >
                  Phone Number
                </label>
                <span className="text-xs text-slate-400">Optional</span>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Phone className="w-4 h-4" />
                </div>
                <input
                  type="tel"
                  id="phoneNumber"
                  name="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={handleInputChange}
                  autoComplete="tel"
                  placeholder="Enter phone number"
                  aria-invalid={errors.phoneNumber ? 'true' : 'false'}
                  aria-describedby={errors.phoneNumber ? 'phoneNumber-error' : undefined}
                  className={`w-full pl-9.5 pr-3.5 py-2.5 rounded-lg border text-sm text-slate-900 placeholder:text-slate-400 transition-colors bg-white focus:outline-none focus:ring-2 ${
                    errors.phoneNumber
                      ? 'border-red-400 focus:border-red-500 focus:ring-red-200 bg-red-50/20'
                      : 'border-slate-300 focus:border-blue-500 focus:ring-blue-100 hover:border-slate-400'
                  }`}
                />
              </div>
              {errors.phoneNumber && (
                <p
                  id="phoneNumber-error"
                  role="alert"
                  className="mt-1.5 text-xs font-medium text-red-600 flex items-center gap-1.5"
                >
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errors.phoneNumber}</span>
                </p>
              )}
            </div>

            {/* Email Address */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-slate-800"
                >
                  Email Address
                </label>
                <span className="text-xs text-slate-400">Optional</span>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  autoComplete="email"
                  placeholder="customer@example.com"
                  aria-invalid={errors.email ? 'true' : 'false'}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                  className={`w-full pl-9.5 pr-3.5 py-2.5 rounded-lg border text-sm text-slate-900 placeholder:text-slate-400 transition-colors bg-white focus:outline-none focus:ring-2 ${
                    errors.email
                      ? 'border-red-400 focus:border-red-500 focus:ring-red-200 bg-red-50/20'
                      : 'border-slate-300 focus:border-blue-500 focus:ring-blue-100 hover:border-slate-400'
                  }`}
                />
              </div>
              {errors.email && (
                <p
                  id="email-error"
                  role="alert"
                  className="mt-1.5 text-xs font-medium text-red-600 flex items-center gap-1.5"
                >
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errors.email}</span>
                </p>
              )}
            </div>
          </div>
        </section>

        {/* SECTION B: Job Details */}
        <section
          aria-labelledby="section-job-heading"
          className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 sm:p-8"
        >
          <div className="flex items-center gap-3 pb-5 border-b border-slate-100 mb-6">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="section-job-heading"
                className="text-lg font-bold text-slate-900 tracking-tight"
              >
                Section B — Job Details
              </h2>
              <p className="text-xs text-slate-500">
                Production parameters, customer requirements, and delivery schedule.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
            {/* Job Title */}
            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="jobTitle"
                  className="block text-sm font-medium text-slate-800"
                >
                  Job Title <span className="text-red-500">*</span>
                </label>
                <span className="text-xs text-slate-400">Required</span>
              </div>
              <input
                type="text"
                id="jobTitle"
                name="jobTitle"
                value={formData.jobTitle}
                onChange={handleInputChange}
                placeholder="e.g. Wedding Invitation Cards"
                aria-invalid={errors.jobTitle ? 'true' : 'false'}
                aria-describedby={errors.jobTitle ? 'jobTitle-error' : undefined}
                className={`w-full px-3.5 py-2.5 rounded-lg border text-sm text-slate-900 placeholder:text-slate-400 transition-colors bg-white focus:outline-none focus:ring-2 ${
                  errors.jobTitle
                    ? 'border-red-400 focus:border-red-500 focus:ring-red-200 bg-red-50/20'
                    : 'border-slate-300 focus:border-blue-500 focus:ring-blue-100 hover:border-slate-400'
                }`}
              />
              {errors.jobTitle && (
                <p
                  id="jobTitle-error"
                  role="alert"
                  className="mt-1.5 text-xs font-medium text-red-600 flex items-center gap-1.5"
                >
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errors.jobTitle}</span>
                </p>
              )}
            </div>

            {/* Customer Requirements */}
            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="requirements"
                  className="block text-sm font-medium text-slate-800"
                >
                  Customer Requirements <span className="text-red-500">*</span>
                </label>
                <span className="text-xs text-slate-400">Required</span>
              </div>
              <textarea
                id="requirements"
                name="requirements"
                rows={4}
                value={formData.requirements}
                onChange={handleInputChange}
                placeholder="Describe the customer's design preferences, colors, material, dimensions, finishing, and other specifications."
                aria-invalid={errors.requirements ? 'true' : 'false'}
                aria-describedby="requirements-help requirements-error"
                className={`w-full px-3.5 py-2.5 rounded-lg border text-sm text-slate-900 placeholder:text-slate-400 transition-colors bg-white focus:outline-none focus:ring-2 leading-relaxed resize-y ${
                  errors.requirements
                    ? 'border-red-400 focus:border-red-500 focus:ring-red-200 bg-red-50/20'
                    : 'border-slate-300 focus:border-blue-500 focus:ring-blue-100 hover:border-slate-400'
                }`}
              />
              <div className="mt-1 flex items-start gap-1.5 text-xs text-slate-500">
                <HelpCircle className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span id="requirements-help">
                  Detailed requirements help prevent misunderstandings and revision cycles during proofing.
                </span>
              </div>
              {errors.requirements && (
                <p
                  id="requirements-error"
                  role="alert"
                  className="mt-1.5 text-xs font-medium text-red-600 flex items-center gap-1.5"
                >
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errors.requirements}</span>
                </p>
              )}
            </div>

            {/* Quantity */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="quantity"
                  className="block text-sm font-medium text-slate-800"
                >
                  Quantity <span className="text-red-500">*</span>
                </label>
                <span className="text-xs text-slate-400">Min 1</span>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Hash className="w-4 h-4" />
                </div>
                <input
                  type="number"
                  id="quantity"
                  name="quantity"
                  min="1"
                  step="1"
                  value={formData.quantity}
                  onChange={handleInputChange}
                  placeholder="e.g. 500"
                  aria-invalid={errors.quantity ? 'true' : 'false'}
                  aria-describedby={errors.quantity ? 'quantity-error' : undefined}
                  className={`w-full pl-9.5 pr-3.5 py-2.5 rounded-lg border text-sm text-slate-900 placeholder:text-slate-400 transition-colors bg-white focus:outline-none focus:ring-2 ${
                    errors.quantity
                      ? 'border-red-400 focus:border-red-500 focus:ring-red-200 bg-red-50/20'
                      : 'border-slate-300 focus:border-blue-500 focus:ring-blue-100 hover:border-slate-400'
                  }`}
                />
              </div>
              {errors.quantity && (
                <p
                  id="quantity-error"
                  role="alert"
                  className="mt-1.5 text-xs font-medium text-red-600 flex items-center gap-1.5"
                >
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errors.quantity}</span>
                </p>
              )}
            </div>

            {/* Due Date */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="dueDate"
                  className="block text-sm font-medium text-slate-800"
                >
                  Due Date
                </label>
                <span className="text-xs text-slate-400">Optional</span>
              </div>
              <input
                type="date"
                id="dueDate"
                name="dueDate"
                min={minDate}
                value={formData.dueDate}
                onChange={handleInputChange}
                aria-invalid={errors.dueDate ? 'true' : 'false'}
                aria-describedby={errors.dueDate ? 'dueDate-error' : undefined}
                className={`w-full px-3.5 py-2.5 rounded-lg border text-sm text-slate-900 placeholder:text-slate-400 transition-colors bg-white focus:outline-none focus:ring-2 ${
                  errors.dueDate
                    ? 'border-red-400 focus:border-red-500 focus:ring-red-200 bg-red-50/20'
                    : 'border-slate-300 focus:border-blue-500 focus:ring-blue-100 hover:border-slate-400'
                }`}
              />
              {errors.dueDate ? (
                <p
                  id="dueDate-error"
                  role="alert"
                  className="mt-1.5 text-xs font-medium text-red-600 flex items-center gap-1.5"
                >
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errors.dueDate}</span>
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-400">
                  Target completion date (today or later).
                </p>
              )}
            </div>

            {/* Internal Notes */}
            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="internalNotes"
                    className="block text-sm font-medium text-slate-800"
                  >
                    Internal Notes
                  </label>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                    <ShieldAlert className="w-3 h-3" />
                    <span>Shop Only</span>
                  </span>
                </div>
                <span className="text-xs text-slate-400">Optional</span>
              </div>
              <textarea
                id="internalNotes"
                name="internalNotes"
                rows={3}
                value={formData.internalNotes}
                onChange={handleInputChange}
                placeholder="Internal notes intended for the print shop only (e.g. machine setup, stock location, priority handling). Not visible to customer."
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 hover:border-slate-400 text-sm text-slate-900 placeholder:text-slate-400 transition-colors bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 leading-relaxed resize-y"
              />
              <p className="mt-1 text-xs text-slate-400">
                These notes remain private to print shop operators and will not be shared with the customer.
              </p>
            </div>
          </div>
        </section>

        {/* Action Buttons Panel */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            id="create-job-cancel-btn"
            onClick={() => navigate('/jobs')}
            disabled={submitting}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>

          <Button
            type="submit"
            variant="primary"
            id="create-job-submit-btn"
            disabled={submitting}
            className="w-full sm:w-auto"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving to Database...</span>
              </span>
            ) : (
              <span>Create Job</span>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
