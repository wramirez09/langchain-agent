"use client";

import * as React from "react";
import { data, StateData } from "../../../app/agents/metaData/states";
import { ncdOptions } from "@/data/ncdOptions";
import AutoCompleteSelect from "../AutoCompleteSelect";
import CreatableSelect from 'react-select/creatable';
import { getInsuranceProvidersOptions, SelectOption } from "../../../data/selectOptions";
import { Textarea } from "../textarea";
import { Input } from "../input";
import { createClient } from '@/utils/client'
import { Activity, ClipboardList, FileBarChart, FileText, MapPin, Stethoscope } from "lucide-react";




type Props = {
  onStateFormStateChange: (key: string, value: string) => void;
  chatOnChange: React.ChangeEventHandler<HTMLTextAreaElement>;
};

const getStateOptions = (data: StateData[]) => {
  return data.map((state) => ({
    value: state.description,
    label: state.description,
  }));
};

const FormInputs: React.FC<Props> = (props: Props) => {
  const [guidelinesoptins, setGuidelinesOptions] = React.useState<SelectOption[]>([])
  const [, setUserEmail] = React.useState('')
  const stateOptions = getStateOptions(data);
  const [, setIsLoggedIn] = React.useState(false)
  React.useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const { user } = session || {}
      setIsLoggedIn(!!session)
      setUserEmail(user?.email || '')
      const options = getInsuranceProvidersOptions({ email: user?.email || '', isSignedIn: !!session });
      setGuidelinesOptions(options)
    }

    checkAuth()

    const { data: { subscription } } = createClient().auth.onAuthStateChange((_event: any, session: any) => {
      setIsLoggedIn(!!session)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleInsuranceSelectChange = React.useCallback(
    (value: string) => props.onStateFormStateChange("Guidelines", value),
    [props],
  );

  const handleStateSelectChange = React.useCallback(
    (value: string) => props.onStateFormStateChange("State", value),
    [props],
  );

  const HandleTreatmentSelectChange = React.useCallback(
    (value: any) => props.onStateFormStateChange("Treatment", value.value),
    [props],
  );

  const handleCptChange = React.useCallback(
    (e: React.ChangeEvent<any>) =>
      props.onStateFormStateChange("CPT code(s)", e.target.value),
    [props],
  );

  const handleDiagnosisChange = React.useCallback(
    (e: React.ChangeEvent<any>) =>
      props.onStateFormStateChange("Diagnosis", e.target.value),
    [props],
  );

  const handleHistoryChange = React.useCallback(
    (e: React.ChangeEvent<any>) =>
      props.onStateFormStateChange("History", e.target.value),
    [props],
  );

  return (
    <section className="w-full max-w-3xl mx-auto px-4 space-y-6">
      {/* Row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        <div>
          <label className="flex items-center gap-2 text-md font-medium text-gray-900 mb-1">
            <FileText size={16} color="#2563EB" />
            Guidelines
          </label>
          <AutoCompleteSelect
            options={guidelinesoptins}
            onChange={handleInsuranceSelectChange}
          />
        </div>
        <div>
          <label className="flex items-center gap-2 text-md font-medium text-gray-900 mb-1">
            <MapPin size={16} color="#059669" />
            State
          </label>
          <AutoCompleteSelect
            options={stateOptions}
            onChange={handleStateSelectChange}
           
          />
        </div>
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        <div>
          <label className="flex items-center gap-2 text-md font-medium text-gray-900 mb-1">
            <Stethoscope size={16} color="#7C3AED" />
            Pre-Auth Request
          </label>
         
          <CreatableSelect isClearable options={ncdOptions} onChange={(value)=>HandleTreatmentSelectChange(value)} className=""/>
          <p className="text-xs text-gray-500 mt-1">
            *Can&apos;t find what you&apos;re looking for? Type to create a new option
          </p>
        </div>
        <div>
          <label className="flex items-center gap-2 text-md font-medium text-gray-900 mb-1">
            <FileBarChart size={16} color="#4F46E5" />
            CPT Code(s)
          </label>
          <Input
            className="w-full h-9 bg-white border-blue-200 text-gray-900 focus-visible:ring-blue-300 focus-visible:border-blue-400"
            placeholder="CPT Codes"
            onChange={handleCptChange}
          />
        </div>
      </div>

      {/* Diagnosis */}
      <div>
        <label className="flex items-center gap-2 text-md font-semi-bold text-black mb-1">
          <Activity size={16} color="#F97316" />
          Diagnosis
        </label>
        <Textarea
          className="w-full bg-white border-blue-200 text-gray-900 focus-visible:ring-blue-300 focus-visible:border-blue-400 min-h-[100px] max-h-[200px] overflow-y-auto resize-y"
          placeholder="knee pain"
          onChange={handleDiagnosisChange}
        />
      </div>

      {/* History */}
      <div>
        <label className="flex items-center gap-2 text-md font-semi-bold text-black mb-1">
          <ClipboardList size={16} color="#F43F5E" />
          Patient(s) Medical History
        </label>
        <Textarea
          className="w-full bg-white border-blue-200 text-gray-900 focus-visible:ring-blue-300 focus-visible:border-blue-400 min-h-[100px] max-h-[200px] overflow-y-auto resize-y"
          placeholder="knee swelling for over 3 weeks."
          onChange={handleHistoryChange}
        />
      </div>

      {/* Chat Context */}
      <div>
        <label className="block text-md font-semi-bold text-black mb-1">
          Relevant Medical History 
        </label>
        <Textarea
          className="w-full bg-white border-blue-200 text-gray-900 focus-visible:ring-blue-300 focus-visible:border-blue-400 min-h-[100px] max-h-[200px] overflow-y-auto resize-y"
          placeholder="previous knee pain, swelling, etc."
          onChange={props.chatOnChange}
        />
      </div>
    </section>
  );
};

export default FormInputs;
